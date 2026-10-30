/*
 * This file is part of the @silarhi/turbo package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

export const PERMANENT_SELECTOR = '[id][data-turbo-permanent]'

// The elements Turbo keeps from one render to the next, as it finds them
export function permanentElements(root: Element): Element[] {
    return [...(root.matches(PERMANENT_SELECTOR) ? [root] : []), ...root.querySelectorAll(PERMANENT_SELECTOR)]
}

// The permanent elements of the container that the new markup has too: Turbo moves them to it, the widgets inside
// still mounted
export function keptElements(container: Element, newElement: Element | undefined): Element[] {
    if (!newElement) {
        return []
    }
    const ids = new Set(permanentElements(newElement).map((element) => element.id))

    return permanentElements(container).filter((element) => ids.has(element.id))
}

// Turbo keeps a permanent element across a stream render by inserting a copy of
// it, and takes the element itself out of the page, its widgets with it: put the
// element back in place of its copy. Returns the elements put back.
export function restorePermanentElements(elements: Element[]): Element[] {
    const restored: Element[] = []
    for (const element of elements) {
        if (element.isConnected) {
            continue
        }
        const copy = document.getElementById(element.id)
        if (copy && copy !== element && copy.matches(PERMANENT_SELECTOR)) {
            copy.replaceWith(element)
            restored.push(element)
        }
    }

    return restored
}

// Whether a morph leaves the element itself as it is: same attributes, and the same
// child nodes (texts and comments by their value, elements by their tag). Turbo
// morphs each child element on its own, so a change deeper down doesn't count.
export function morphKeeps(element: Element, newElement: Element): boolean {
    if (element.tagName !== newElement.tagName || element.attributes.length !== newElement.attributes.length) {
        return false
    }
    for (const { name, value } of element.attributes) {
        if (newElement.getAttribute(name) !== value) {
            return false
        }
    }

    const children = element.childNodes
    const newChildren = newElement.childNodes
    if (children.length !== newChildren.length) {
        return false
    }

    return [...children].every((child, index) => {
        const newChild = newChildren[index]
        if (child instanceof Element) {
            return newChild instanceof Element && child.tagName === newChild.tagName
        }

        return child.nodeType === newChild.nodeType && child.nodeValue === newChild.nodeValue
    })
}

// Whether one of the ancestors of the node is in the set
export function inside(node: Node, elements: Set<Node>): boolean {
    for (let parent = node.parentNode; parent; parent = parent.parentNode) {
        if (elements.has(parent)) {
            return true
        }
    }

    return false
}

// Whether the node is in the set, or inside one of its elements
export function within(node: Node, elements: Set<Node>): boolean {
    return elements.has(node) || inside(node, elements)
}

// The elements that aren't inside another one of the list
export function outermost<T extends Element>(elements: Iterable<T>): T[] {
    const set = new Set<Node>(elements)

    return [...elements].filter((element) => !inside(element, set))
}

// Move a node, keeping its state (an iframe, a playing video) where the browser can
function move(parent: Node, node: Node, before: Node | null): void {
    const moveBefore = (parent as Node & { moveBefore?: (node: Node, before: Node | null) => void }).moveBefore
    if (moveBefore) {
        try {
            moveBefore.call(parent, node, before)
            return
        } catch {
            // A node or parent moveBefore refuses (not connected): a plain move
        }
    }
    parent.insertBefore(node, before)
}

// Call back on a container with the elements set aside moved out of it, to a hidden
// holder outside the container, and back in place right after: the callbacks look
// for widgets inside the container, and can't skip them otherwise.
export function aside(container: Element, elements: Element[], callback: (container: Element) => void): void {
    const moved = elements.filter((element) => element !== container && container.contains(element))
    if (moved.length === 0) {
        callback(container)
        return
    }

    const holder = document.createElement('div')
    holder.hidden = true
    document.documentElement.append(holder)
    const places = moved.map((element) => {
        const place = document.createComment('')
        element.before(place)
        move(holder, element, null)

        return [place, element] as const
    })
    try {
        callback(container)
    } finally {
        for (const [place, element] of places) {
            if (place.parentNode) {
                move(place.parentNode, element, place)
            }
            place.remove()
        }
        holder.remove()
    }
}

// Watch the child lists under the root until the returned function stops it, and
// returns every record. Collected in the callback too: an async render yields, and
// the observer may deliver (and drain) records before takeRecords reads them.
export function observe(root: Node, onRecords?: () => void): () => MutationRecord[] {
    const records: MutationRecord[] = []
    const observer = new MutationObserver((list) => {
        records.push(...list)
        onRecords?.()
    })
    observer.observe(root, { childList: true, subtree: true })

    return () => {
        records.push(...observer.takeRecords())
        observer.disconnect()

        return records
    }
}

// The elements the records added, and where each node they removed was first: a
// node moved (reported as removed then added) keeps its first parent.
export function changes(records: MutationRecord[]): { added: Set<Element>; parents: Map<Node, Node> } {
    const added = new Set<Element>()
    const parents = new Map<Node, Node>()
    for (const record of records) {
        for (const node of record.removedNodes) {
            if (!parents.has(node)) {
                parents.set(node, record.target)
            }
        }
        for (const node of record.addedNodes) {
            if (node instanceof Element) {
                added.add(node)
            }
        }
    }

    return { added, parents }
}

// Run a render, sync or async, then the callback, even when the render throws
export function afterRender(render: () => unknown, callback: () => void): unknown {
    let result: unknown
    try {
        result = render()
    } catch (error) {
        callback()
        throw error
    }
    if (result instanceof Promise) {
        return result.finally(callback)
    }
    callback()

    return result
}
