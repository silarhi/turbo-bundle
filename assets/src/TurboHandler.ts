/*
 * This file is part of the @silarhi/turbo package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

declare global {
    interface Window {
        Turbo?: {
            visit: (location: string) => void
            session?: {
                // The visit in flight, read to tell a promoted frame visit (no body render) from a real one
                navigator?: { currentVisit?: { state?: string; willRender?: boolean } }
                // Wrapped to keep a promoted frame visit out of the snapshot cache
                visit?: SessionVisit
            }
            // Its render function, compared with the one of a frame render to tell a morph from a replace
            FrameRenderer?: { renderElement: unknown }
            // Its clone, wrapped to cache the server markup of the permanent elements left mounted
            PageSnapshot?: { prototype: { clone: SnapshotClone } }
        }
    }
}

export interface TurboHandlerOptions {
    /**
     * Mount your per-container listeners on a freshly rendered/inserted element:
     * the `getContainer` element, a `<turbo-frame>`, or a node a Stream inserted.
     * A wider `(container: Element | Document) => void` function fits too.
     */
    onMount: (container: Element) => void
    /** Tear down the listeners previously mounted on a container before it leaves the DOM. */
    onUnmount: (container: Element) => void
    /**
     * Resolve the root element a full Turbo Drive render mounts on.
     * Defaults to `document.body`.
     */
    getContainer?: (document: Document) => Element
    /**
     * Follow a server-issued `Turbo-Location` redirect (pairs with the PHP
     * `TurboFrameListener`). Defaults to `window.Turbo.visit(url)`, or to a full
     * page load (`window.location.assign(url)`, with a console warning) when the
     * `Turbo` global is missing.
     */
    onRedirect?: (url: string) => void
    /**
     * Diff the DOM around every Turbo Stream render and mount/unmount the nodes
     * it touched, so per-mount listeners initialize on stream/Mercure-inserted
     * content. Morph-aware. Defaults to `true`; pass `false` for stock Turbo
     * behavior (no per-node lifecycle on stream renders).
     */
    streamMutations?: boolean
    /**
     * Handle Turbo **morph** renders (Drive `turbo-refresh-method="morph"`,
     * `<turbo-frame refresh="morph">` and streams with `method="morph"`) per-node
     * instead of re-initializing the whole container. When `true`, each element
     * the morph changes (its attributes or its own child nodes) is unmounted
     * before the morph touches it, each element it removes is unmounted, and
     * the changed and added elements are mounted once the whole morph is done —
     * so listeners on nodes the morph preserved, and on the ancestors of the
     * changed ones, are left untouched. Defaults to `false` (faithful
     * whole-container re-init). Requires `onMount` / `onUnmount` to be safe to
     * call on an individual element.
     */
    morphMutations?: boolean
    /**
     * When a frame response has no matching `<turbo-frame>` (`turbo:frame-missing`),
     * cancel Turbo's default handling (an error message written into the frame
     * plus a thrown exception) and render the response as a full Drive visit
     * instead. Defaults to `false` (stock Turbo behavior). Requires Turbo 7.2+.
     */
    visitOnFrameMissing?: boolean
    /**
     * Run the `<turbo-stream>` elements a frame response carries **outside** any
     * `<turbo-frame>`, which Turbo otherwise discards with the rest of the page
     * (`turbo:frame-render`). Lets the server answer a frame request
     * and update the page around it — typically the layout appending the flash
     * messages to a page-level container — with the same stream markup as a
     * Turbo Stream response. Defaults to `false` (stock Turbo behavior).
     */
    frameStreams?: boolean
}

interface VisitOptions {
    willRender?: boolean
    shouldCacheSnapshot?: boolean
    [option: string]: unknown
}

type SessionVisit = (location: unknown, options?: VisitOptions) => unknown

type SnapshotClone = (this: { element: Element }) => { element: Element }

interface BeforeFetchRequestDetail {
    fetchOptions: { headers: Record<string, string> }
}

interface BeforeFetchResponseDetail {
    fetchResponse: { response: { headers: Headers } }
}

interface SubmitEndDetail {
    success: boolean
    fetchResponse?: { contentType?: string }
    formSubmission: { fetchRequest: { headers: Record<string, string> } }
}

interface FrameMissingDetail {
    response: Response
    visit: (location: Response | string) => Promise<void> | void
}

interface FrameRenderDetail {
    fetchResponse?: { responseHTML: Promise<string | undefined> }
}

interface BeforeMorphElementDetail {
    newElement?: Node
}

interface BeforeStreamRenderDetail {
    render: (streamElement: Element) => Promise<void> | void
}

type RenderElement = (currentElement: Element, newElement: Element) => unknown

// `turbo:before-render` / `turbo:render` / `turbo:before-frame-render` all carry
// the render method ('morph' | 'replace') on their detail, and the before events
// the function that renders.
interface RenderDetail {
    renderMethod?: string
    render?: RenderElement
    // The new <body> of turbo:before-render, the new frame of turbo:before-frame-render
    newBody?: Element
    newFrame?: Element
}

// One morph in flight: the elements it changes, unmounted before it does and
// mounted again once it is done, with what it added.
interface MorphScope {
    changed: Set<Element>
    // The permanent elements left mounted inside the changed ones
    kept: Set<Element>
    records: MutationRecord[]
    observer: MutationObserver | null
}

interface Binding {
    type: string
    handler: EventListener
}

const FRAME_HEADER = 'Turbo-Frame'
const FOLLOW_REDIRECT_HEADER = 'Turbo-Frame-Follow-Redirect'
const LOCATION_HEADER = 'Turbo-Location'
const FOLLOW_REDIRECT_ATTRIBUTE = 'data-turbo-follow-redirect'
const MORPH_RENDER_METHOD = 'morph'
const PERMANENT_SELECTOR = '[id][data-turbo-permanent]'

// The elements Turbo keeps from one render to the next, as it finds them
function permanentElements(root: Element): Element[] {
    return [...(root.matches(PERMANENT_SELECTOR) ? [root] : []), ...root.querySelectorAll(PERMANENT_SELECTOR)]
}

// The permanent elements of the container that the new markup has too: Turbo moves them to it, the widgets inside
// still mounted
function keptElements(container: Element, newElement: Element | undefined): Element[] {
    if (!newElement) {
        return []
    }
    const ids = new Set(permanentElements(newElement).map((element) => element.id))

    return permanentElements(container).filter((element) => ids.has(element.id))
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

// Whether a morph leaves the element itself as it is: same attributes, and the same
// child nodes (texts and comments by their value, elements by their tag). Turbo
// morphs each child element on its own, so a change deeper down doesn't count.
function morphKeeps(element: Element, newElement: Element): boolean {
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
function inside(node: Node, elements: Set<Node>): boolean {
    for (let parent = node.parentNode; parent; parent = parent.parentNode) {
        if (elements.has(parent)) {
            return true
        }
    }

    return false
}

// Whether the node is in the set, or inside one of its elements
function within(node: Node, elements: Set<Node>): boolean {
    return elements.has(node) || inside(node, elements)
}

// A stream that morphs its targets instead of replacing them: Turbo morphs them in
// place, which a diff of the child nodes alone doesn't see.
function isMorphStream(streamElement: Element): boolean {
    const action = streamElement.getAttribute('action')

    return streamElement.getAttribute('method') === 'morph' && (action === 'replace' || action === 'update')
}

// Whether a stream replace morph changes the target itself. Unmount it before the
// render then: Turbo stops the morph at the node after the target, which a widget
// may have inserted (a Tom Select's markup) and remove when unmounted mid-morph,
// leaving the morph to remove every node after it.
function replacedByMorph(target: Element, streamElement: Element): boolean {
    const template = streamElement.firstElementChild
    const newElement = template instanceof HTMLTemplateElement ? template.content.firstElementChild : null

    return streamElement.getAttribute('action') === 'replace' && (!newElement || !morphKeeps(target, newElement))
}

// A `data-turbo-action` frame navigation (advance / replace) is promoted to a page
// visit that only updates the URL: Turbo still fires turbo:before-render,
// turbo:render and turbo:load, but with `willRender: false` it never replaces the
// <body>. Only a visit still in flight counts — once completed, the navigator keeps
// it as `currentVisit`, and a later failed submission renders with it.
function isRenderlessVisit(): boolean {
    const currentVisit = window.Turbo?.session?.navigator?.currentVisit

    return currentVisit?.state === 'started' && currentVisit.willRender === false
}

// Default `onRedirect`: a Drive visit through the global `@hotwired/turbo` sets
// when imported. Without it, a full page load still reaches the target, where
// doing nothing would leave the page as it was after the response was cancelled.
function visit(url: string): void {
    if (window.Turbo) {
        window.Turbo.visit(url)
        return
    }

    console.warn(`@silarhi/turbo: window.Turbo is not defined, loading ${url} without Turbo Drive.`)
    window.location.assign(url)
}

/**
 * Wires the Turbo Drive / Frame / Stream lifecycle to a single pair of
 * mount/unmount callbacks, so framework code stays project-agnostic.
 *
 * The DOM-event wiring below is the single source of truth for when listeners
 * init and clean up — mirror your app's `mount(container)` / `unmount(container)`
 * onto `onMount` / `onUnmount`.
 */
export class TurboHandler {
    readonly #onMount: (container: Element) => void
    readonly #onUnmount: (container: Element) => void
    readonly #getContainer: (document: Document) => Element
    readonly #onRedirect: (url: string) => void
    readonly #streamMutations: boolean
    readonly #morphMutations: boolean
    readonly #visitOnFrameMissing: boolean
    readonly #frameStreams: boolean

    #started = false
    #initialLoad = true
    #bodyRendered = false
    #failedSubmissionRender = false
    // The body was unmounted for the snapshot cache: the next turbo:load must mount it,
    // even when the render that follows doesn't (a morph)
    #unmountedForCache = false
    #bindings: Binding[] = []
    // Turbo's session.visit, and the wrapper that replaced it, put back on stop()
    #sessionVisit: { original: SessionVisit; wrapper: SessionVisit } | null = null
    // Frames whose in-flight render is a morph — so turbo:frame-load (which
    // carries no renderMethod) knows to skip the coarse mount.
    #morphingFrames = new WeakSet<Element>()
    #morph: MorphScope | null = null
    // The permanent elements the render in flight keeps, left mounted: turbo:load mounts the body around them
    #kept: Element[] = []
    // The frames between turbo:before-frame-render and turbo:frame-load: the permanent
    // elements they keep, whether Turbo swapped their content in yet, and whether a
    // body mount (the first turbo:load, which can come in between) mounted the frame
    #renderingFrames = new Map<Element, { kept: Element[]; mounted: boolean }>()
    // What the handler mounted while a body mount was pending (a frame or a stream that
    // rendered before the first turbo:load): the body mount would mount it a second time
    #bodyMountPending = true
    #mountedSinceLoad: { element: Element; kept: Element[] }[] = []
    // Watches the streams already in the page when the handler started
    #pendingStreams: MutationObserver | null = null
    // The permanent elements left mounted when the body was unmounted for the cache
    #keptForCache: Element[] = []
    // The markup of each permanent element before its first mount: the snapshot cache keeps it, not the widgets
    #pristine = new WeakMap<Element, Element>()
    // Turbo's PageSnapshot.prototype.clone, and the wrapper that replaced it, put back on stop()
    #snapshotClone: { original: SnapshotClone; wrapper: SnapshotClone } | null = null

    constructor(options: TurboHandlerOptions) {
        this.#onMount = options.onMount
        this.#onUnmount = options.onUnmount
        this.#getContainer = options.getContainer ?? ((document) => document.body)
        this.#onRedirect = options.onRedirect ?? visit
        this.#streamMutations = options.streamMutations ?? true
        this.#morphMutations = options.morphMutations ?? false
        this.#visitOnFrameMissing = options.visitOnFrameMissing ?? false
        this.#frameStreams = options.frameStreams ?? false
    }

    /** Attach every document listener. Idempotent — calling twice is a no-op. */
    start(): void {
        if (this.#started) {
            return
        }
        this.#started = true

        this.#bindings = [
            { type: 'turbo:before-fetch-request', handler: this.#onBeforeFetchRequest },
            { type: 'turbo:before-fetch-response', handler: this.#onBeforeFetchResponse },
            { type: 'turbo:submit-end', handler: this.#onSubmitEnd },
            { type: 'turbo:render', handler: this.#onRender },
            { type: 'turbo:load', handler: this.#onLoad },
            { type: 'turbo:frame-load', handler: this.#onFrameLoad },
            { type: 'turbo:before-render', handler: this.#onBeforeRender },
            { type: 'turbo:before-frame-render', handler: this.#onBeforeFrameRender },
            { type: 'turbo:before-cache', handler: this.#onBeforeCache },
        ]

        if (this.#streamMutations) {
            this.#bindings.push({ type: 'turbo:before-stream-render', handler: this.#onBeforeStreamRender })
        }

        if (this.#morphMutations) {
            this.#bindings.push({ type: 'turbo:before-morph-element', handler: this.#onBeforeMorphElement })
        }

        if (this.#visitOnFrameMissing) {
            this.#bindings.push({ type: 'turbo:frame-missing', handler: this.#onFrameMissing })
        }

        if (this.#frameStreams) {
            this.#bindings.push({ type: 'turbo:frame-render', handler: this.#onFrameRender })
        }

        for (const { type, handler } of this.#bindings) {
            document.addEventListener(type, handler)
        }

        this.#wrapSessionVisit()
        this.#wrapSnapshotClone()
        if (this.#streamMutations) {
            this.#watchPendingStreams()
        }
    }

    /** Detach every document listener and reset to a pre-boot state. Idempotent. */
    stop(): void {
        if (!this.#started) {
            return
        }

        for (const { type, handler } of this.#bindings) {
            document.removeEventListener(type, handler)
        }

        this.#bindings = []
        this.#unwrapSessionVisit()
        this.#unwrapSnapshotClone()
        this.#started = false
        this.#initialLoad = true
        this.#bodyRendered = false
        this.#failedSubmissionRender = false
        this.#unmountedForCache = false
        this.#morphingFrames = new WeakSet()
        this.#morph?.observer?.disconnect()
        this.#morph = null
        this.#kept = []
        this.#renderingFrames = new Map()
        this.#mountedSinceLoad = []
        this.#bodyMountPending = true
        this.#keptForCache = []
        this.#pendingStreams?.disconnect()
        this.#pendingStreams = null
    }

    // A frame navigation promoted to a page visit (`data-turbo-action`) caches a
    // copy of the page Turbo 8 took when the navigation started, or Turbo 7 when the
    // visit completes, while the page is still on screen: with what listeners added
    // to it (a Tom Select's markup), as no turbo:before-cache cleanup can reach it.
    // Back would restore that copy and mount the widgets a second time. Don't cache
    // it: Back loads the page from the server instead, as after a Turbo 8 refresh.
    // Turbo then no longer fires turbo:before-cache on a page that stays on screen
    // either, which removed its [data-turbo-temporary] elements (hotwired/turbo#1553).
    #wrapSessionVisit(): void {
        const session = window.Turbo?.session
        if (this.#sessionVisit || typeof session?.visit !== 'function') {
            return
        }

        const original = session.visit
        const wrapper = function (this: unknown, location: unknown, options: VisitOptions = {}): unknown {
            return original.call(
                this,
                location,
                options.willRender === false ? { ...options, shouldCacheSnapshot: false } : options
            )
        }
        session.visit = wrapper
        this.#sessionVisit = { original, wrapper }
    }

    // Put Turbo's session.visit back, unless something wrapped it again since
    #unwrapSessionVisit(): void {
        const session = window.Turbo?.session
        if (session && this.#sessionVisit && session.visit === this.#sessionVisit.wrapper) {
            session.visit = this.#sessionVisit.original
        }
        this.#sessionVisit = null
    }

    // The permanent elements stay mounted when the body is unmounted for the cache, so
    // the copy Turbo caches holds their widgets. Put the markup they had before their
    // first mount in that copy instead: a snapshot restored without them mounts it.
    #wrapSnapshotClone(): void {
        const prototype = window.Turbo?.PageSnapshot?.prototype
        if (this.#snapshotClone || typeof prototype?.clone !== 'function') {
            return
        }

        const original = prototype.clone
        const pristine = this.#pristine
        const wrapper: SnapshotClone = function (this: { element: Element }) {
            const snapshot = original.call(this)
            // cloneNode keeps the order: the nth copy is the copy of the nth element
            const elements = permanentElements(this.element)
            for (const [index, copy] of permanentElements(snapshot.element).entries()) {
                const markup = elements[index] && pristine.get(elements[index])
                if (markup) {
                    copy.replaceWith(markup.cloneNode(true))
                }
            }

            return snapshot
        }
        prototype.clone = wrapper
        this.#snapshotClone = { original, wrapper }
    }

    #unwrapSnapshotClone(): void {
        const prototype = window.Turbo?.PageSnapshot?.prototype
        if (prototype && this.#snapshotClone && prototype.clone === this.#snapshotClone.wrapper) {
            prototype.clone = this.#snapshotClone.original
        }
        this.#snapshotClone = null
    }

    // A <turbo-stream> in the page renders once Turbo defines the element, when it is
    // imported: before an app that imports Turbo first starts the handler, which never
    // sees its turbo:before-stream-render. Watch its targets until it is done, and
    // mount what it inserted, unmount what it removed.
    #watchPendingStreams(): void {
        const streams = customElements.get('turbo-stream') ? [...document.querySelectorAll('turbo-stream')] : []
        const targets = new Set(
            streams.flatMap((stream) => (stream as Element & { targetElements?: Element[] }).targetElements ?? [])
        )
        if (targets.size === 0) {
            return
        }

        const records: MutationRecord[] = []
        const observer = new MutationObserver((list) => {
            records.push(
                ...list.filter(
                    (record) =>
                        within(record.target, targets) ||
                        [...record.removedNodes].some((node) => targets.has(node as Element))
                )
            )
            if (streams.every((stream) => !stream.isConnected)) {
                observer.disconnect()
                this.#pendingStreams = null
                this.#reconcile(records, [])
            }
        })
        observer.observe(this.#getContainer(document), { childList: true, subtree: true })
        this.#pendingStreams = observer
    }

    // onMount on a container, the permanent elements kept mounted set aside. Record
    // the markup of the permanent elements it mounts first.
    #mount(container: Element, kept: Element[] = []): void {
        const aside = new Set(kept)
        for (const element of permanentElements(container)) {
            if (!this.#pristine.has(element) && !within(element, aside)) {
                this.#pristine.set(element, element.cloneNode(true) as Element)
            }
        }
        this.#aside(container, kept, this.#onMount)
        if (this.#bodyMountPending) {
            this.#mountedSinceLoad.push({ element: container, kept })
        }
    }

    // Before the body is mounted whole, unmount what was mounted in it since the last
    // turbo:load, the outermost only, so each widget is mounted once
    #unmountMountedSinceLoad(container: Element, kept: Element[]): void {
        const mounted = this.#mountedSinceLoad.filter(
            ({ element }) => element !== container && element.isConnected && container.contains(element)
        )
        const elements = new Set(mounted.map(({ element }) => element))
        for (const { element, kept: keptInside } of mounted) {
            if (!inside(element, elements)) {
                this.#safe(() => this.#unmount(element, keptInside))
                kept.push(...keptInside)
            }
        }
    }

    // onUnmount on a container, the permanent elements kept mounted set aside
    #unmount(container: Element, kept: Element[] = []): void {
        this.#aside(container, kept, this.#onUnmount)
    }

    // Call back on a container with the kept elements moved out of it, to a hidden
    // holder outside the container, and back in place right after: the callbacks
    // look for widgets inside the container, and can't skip them otherwise.
    #aside(container: Element, kept: Element[], callback: (container: Element) => void): void {
        const elements = kept.filter((element) => element !== container && container.contains(element))
        if (elements.length === 0) {
            callback(container)
            return
        }

        const holder = document.createElement('div')
        holder.hidden = true
        document.documentElement.append(holder)
        const places = elements.map((element) => {
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

    // Turbo keeps a permanent element across a stream render by inserting a copy of
    // it, and takes the element itself out of the page, its widgets with it: put the
    // element back in place of its copy. Returns the elements put back.
    #restorePermanentElements(elements: Element[]): Element[] {
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

    // A frame with `data-turbo-follow-redirect` opts into server-side redirect
    // following: tell the backend by echoing the intent as a request header.
    #onBeforeFetchRequest = (event: Event): void => {
        // Turbo loaded after start(): wrap its session before a frame navigation proposes a visit
        this.#wrapSessionVisit()
        this.#wrapSnapshotClone()

        const { fetchOptions } = (event as CustomEvent<BeforeFetchRequestDetail>).detail
        const frameId = fetchOptions.headers[FRAME_HEADER]
        if (!frameId) {
            return
        }

        const frame = document.getElementById(frameId)
        if (!frame?.hasAttribute(FOLLOW_REDIRECT_ATTRIBUTE)) {
            return
        }

        fetchOptions.headers[FOLLOW_REDIRECT_HEADER] = '1'
    }

    // The server answered a frame request with a `Turbo-Location`: escalate to a
    // full Drive visit instead of swapping the frame.
    #onBeforeFetchResponse = (event: Event): void => {
        const { fetchResponse } = (event as CustomEvent<BeforeFetchResponseDetail>).detail
        const location = fetchResponse.response.headers.get(LOCATION_HEADER)
        if (!location) {
            return
        }

        event.preventDefault()
        this.#onRedirect(location)
    }

    // The frame response has no matching <turbo-frame> (e.g. an expired session
    // redirecting to a login page): render it as a full page instead of letting
    // Turbo write an error into the frame and throw.
    #onFrameMissing = (event: Event): void => {
        const { response, visit } = (event as CustomEvent<FrameMissingDetail>).detail
        event.preventDefault()
        visit(response)
    }

    // The frame swapped in its own content only: run the response's layout-level
    // streams, outside any frame (the ones inside the rendered frame came in
    // with it, and Turbo ran them on insertion). Connecting a <turbo-stream> to
    // the document performs its action; the stream render hook then mounts what
    // it inserted.
    #onFrameRender = async (event: Event): Promise<void> => {
        const html = await (event as CustomEvent<FrameRenderDetail>).detail?.fetchResponse?.responseHTML
        if (!html) {
            return
        }

        const response = new DOMParser().parseFromString(html, 'text/html')
        for (const stream of response.querySelectorAll('turbo-stream')) {
            if (!stream.closest('turbo-frame')) {
                document.body.append(document.importNode(stream, true))
            }
        }
    }

    // A failed Drive submission (e.g. 422 outside any frame) makes Turbo render
    // the <body> directly: turbo:before-render fires (old body unmounts) but
    // turbo:load does NOT, so flag it here and let turbo:render mount the body.
    #onSubmitEnd = (event: Event): void => {
        const { success, fetchResponse, formSubmission } = (event as CustomEvent<SubmitEndDetail>).detail
        if (success || !fetchResponse?.contentType?.startsWith('text/html')) {
            return
        }
        if (formSubmission.fetchRequest.headers[FRAME_HEADER]) {
            return
        }
        this.#failedSubmissionRender = true
    }

    #onRender = (event: Event): void => {
        if (this.#failedSubmissionRender) {
            // Failed-submission render: no turbo:load follows, so mount here.
            this.#failedSubmissionRender = false
            this.#mount(this.#getContainer(document), this.#kept)
            this.#kept = []
            return
        }
        if (this.#isMorph(event)) {
            // Morph preserves the <body> in place; turbo:morph-element handles the
            // changed nodes, so don't let turbo:load re-mount the whole body.
            return
        }
        if (isRenderlessVisit()) {
            // Promoted frame visit: the frame already re-mounted on turbo:frame-load
            return
        }
        this.#bodyRendered = true
    }

    // Only a real render (or the very first load) mounts the body: a promoted
    // frame visit (`data-turbo-action`) fires turbo:load without one.
    #onLoad = (): void => {
        if (this.#initialLoad || this.#bodyRendered || this.#unmountedForCache) {
            const container = this.#getContainer(document)
            const kept = [...this.#kept]
            for (const [frame, rendering] of this.#renderingFrames) {
                if (!frame.isConnected) {
                    this.#renderingFrames.delete(frame)
                } else if (container.contains(frame)) {
                    rendering.mounted = true
                    kept.push(...rendering.kept)
                }
            }
            this.#unmountMountedSinceLoad(container, kept)
            this.#mount(container, kept)
        }
        this.#mountedSinceLoad = []
        this.#bodyMountPending = false
        this.#initialLoad = false
        this.#bodyRendered = false
        this.#unmountedForCache = false
        this.#kept = []
        this.#keptForCache = []
    }

    // Turbo clones the page into its snapshot cache one tick after this event, which
    // can come before turbo:before-render (the head merge waits for new stylesheets):
    // unmount now, so the snapshot holds the server DOM and not what listeners added
    // (a restored or previewed snapshot would otherwise get them twice). Not for a
    // promoted frame visit, which caches a copy taken when the frame navigation started
    // and renders nothing to re-mount after. The permanent elements stay mounted, the
    // next page may keep them: the snapshot gets their markup from before their mount.
    #onBeforeCache = (): void => {
        if (isRenderlessVisit()) {
            return
        }
        const container = this.#getContainer(document)
        this.#keptForCache = this.#snapshotClone ? permanentElements(container) : []
        this.#unmount(container, this.#keptForCache)
        this.#unmountedForCache = true
        this.#bodyMountPending = true
    }

    #onFrameLoad = (event: Event): void => {
        const frame = event.target
        if (!(frame instanceof Element)) {
            return
        }
        if (this.#morphingFrames.delete(frame)) {
            // Morph frame render: the morph already refreshed what it changed
            return
        }
        const rendering = this.#renderingFrames.get(frame)
        this.#renderingFrames.delete(frame)
        if (rendering?.mounted) {
            // A body mount after Turbo swapped the content in mounted it already
            return
        }
        this.#mount(frame, rendering?.kept)
    }

    #onBeforeRender = (event: Event): void => {
        if (isRenderlessVisit()) {
            return
        }
        const container = this.#getContainer(document)
        const detail = (event as CustomEvent<RenderDetail>).detail
        this.#bodyMountPending = true
        // Turbo moves the permanent elements the new page has too; a morph never removes one
        const kept =
            detail?.renderMethod === MORPH_RENDER_METHOD
                ? permanentElements(container)
                : keptElements(container, detail?.newBody)
        if (this.#unmountedForCache) {
            // Unmounted for the cache but the permanent elements: unmount the ones the new
            // page drops, turbo:load mounts the rest. A body unmounted whole is mounted whole.
            for (const element of this.#keptForCache) {
                if (!kept.includes(element)) {
                    this.#unmount(element)
                }
            }
            this.#kept = kept.filter((element) => this.#keptForCache.includes(element))
            this.#keptForCache = this.#kept
            return
        }
        if (this.#isMorph(event)) {
            this.#trackRender(event)
            return
        }
        this.#kept = kept
        this.#unmount(container, kept)
    }

    #onBeforeFrameRender = (event: Event): void => {
        const frame = event.target
        if (!(frame instanceof Element)) {
            return
        }
        if (this.#isMorph(event) || this.#isFrameMorph(event, frame)) {
            this.#morphingFrames.add(frame)
            this.#trackRender(event)
            return
        }
        const detail = (event as CustomEvent<RenderDetail>).detail
        const kept = keptElements(frame, detail?.newFrame)
        const rendering = { kept, mounted: false }
        this.#renderingFrames.set(frame, rendering)
        this.#unmount(frame, kept)

        const render = detail?.render
        if (!render) {
            return
        }
        const handler = this
        detail.render = function (this: unknown, currentElement: Element, newElement: Element): unknown {
            if (rendering.mounted) {
                // A body mount came before the swap, and mounted the old content again
                rendering.mounted = false
                handler.#unmount(frame, kept)
            }
            return render.call(this, currentElement, newElement)
        }
    }

    // True only when opted into morphMutations AND Turbo reports a morph render.
    #isMorph(event: Event): boolean {
        return this.#morphMutations && (event as CustomEvent<RenderDetail>).detail?.renderMethod === MORPH_RENDER_METHOD
    }

    // Turbo 8 reports a frame morph as a "replace": its MorphingFrameRenderer doesn't
    // override renderMethod. Only a morph renders a frame with another function than
    // the one of FrameRenderer, and only on a frame with refresh="morph".
    #isFrameMorph(event: Event, frame: Element): boolean {
        const renderElement = window.Turbo?.FrameRenderer?.renderElement

        return (
            this.#morphMutations &&
            renderElement !== undefined &&
            frame.getAttribute('refresh') === MORPH_RENDER_METHOD &&
            (event as CustomEvent<RenderDetail>).detail?.render !== renderElement
        )
    }

    // Run the render the event is about to start as one morph
    #trackRender(event: Event): void {
        const detail = (event as CustomEvent<RenderDetail>).detail
        const render = detail?.render
        if (!render) {
            return
        }

        const handler = this
        detail.render = function (this: unknown, currentElement: Element, newElement: Element): unknown {
            return handler.#morphing(() => render.call(this, currentElement, newElement))
        }
    }

    // Turbo fires turbo:before-morph-element, before it morphs an element, for each
    // one the morph matched, the unchanged ones and <body> included, and for each
    // one it removes, without a newElement. Unmount the ones it changes or removes
    // now: once morphed, a widget would clean up into the new markup (Tom Select
    // puts back the options it found). Nothing inside an element already unmounted.
    #onBeforeMorphElement = (event: Event): void => {
        const element = event.target
        if (!(element instanceof Element) || this.#unmountedForCache) {
            return
        }

        const newElement = (event as CustomEvent<BeforeMorphElementDetail>).detail?.newElement
        if (newElement instanceof Element && morphKeeps(element, newElement)) {
            return
        }

        const scope = this.#morph ?? this.#openLazyScope()
        if (within(element, scope.changed)) {
            return
        }
        if (!newElement) {
            this.#safe(() => this.#unmount(element))
            return
        }
        // The morph leaves the permanent elements inside as they are
        const kept = permanentElements(element).filter((permanent) => permanent !== element)
        this.#safe(() => this.#unmount(element, kept))
        scope.changed.add(element)
        for (const permanent of kept) {
            scope.kept.add(permanent)
        }
    }

    // A morph Turbo runs outside a render or stream the handler wraps (a stream
    // with streamMutations off, a call to Turbo.morphElements): it runs at once, so
    // mount what it changed on the next microtask. What it added is left alone.
    #openLazyScope(): MorphScope {
        const scope: MorphScope = { changed: new Set(), kept: new Set(), records: [], observer: null }
        this.#morph = scope
        queueMicrotask(() => this.#closeScope(scope))

        return scope
    }

    /**
     * Run a render that morphs: `changed` (stream targets re-mounted whole) is
     * unmounted first, turbo:before-morph-element unmounts what the morph changes or
     * removes while it runs, and once it is done the changed elements and the ones it
     * added are mounted, each once and only the outermost.
     */
    #morphing(render: () => unknown, changed: Element[] = []): unknown {
        if (this.#morph) {
            this.#closeScope(this.#morph)
        }

        // The morph leaves the permanent elements of the targets as they are
        const kept = changed.flatMap((element) => permanentElements(element))
        for (const element of changed) {
            this.#safe(() => this.#unmount(element, kept))
        }
        const scope: MorphScope = { changed: new Set(changed), kept: new Set(kept), records: [], observer: null }
        // Collect in the callback too: an async render yields, and the observer may
        // deliver (and drain) records before takeRecords reads them
        scope.observer = new MutationObserver((list) => {
            scope.records.push(...list)
        })
        scope.observer.observe(this.#getContainer(document), { childList: true, subtree: true })
        this.#morph = scope

        let result: unknown
        try {
            result = render()
        } catch (error) {
            this.#closeScope(scope)
            throw error
        }
        if (result instanceof Promise) {
            return result.finally(() => this.#closeScope(scope))
        }
        this.#closeScope(scope)

        return result
    }

    #closeScope(scope: MorphScope): void {
        if (this.#morph !== scope) {
            return
        }
        this.#morph = null
        if (scope.observer) {
            scope.records.push(...scope.observer.takeRecords())
            scope.observer.disconnect()
        }

        // Where each node the morph removed or moved was first: idiomorph moves a node
        // with a kept id (reported as removed then added), through a hidden pantry
        const parents = new Map<Node, Node>()
        const added = new Set<Element>()
        for (const record of scope.records) {
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

        const mounts = new Set<Element>(scope.changed)
        const moved: Element[] = []
        for (const node of added) {
            const parent = parents.get(node)
            if (within(node, scope.kept)) {
                // A permanent element left mounted, moved back by the stream render
                continue
            }
            if (!parent) {
                mounts.add(node)
            } else if (within(parent, scope.changed)) {
                // Moved out of an element unmounted with its listeners
                mounts.add(node)
            } else {
                moved.push(node)
            }
        }
        for (const node of moved) {
            // Moved, mounted, into an element mounted again below
            if (node.isConnected && inside(node, mounts)) {
                this.#safe(() => this.#onUnmount(node))
            }
        }
        const kept = [...scope.kept].filter((element) => element.isConnected)
        for (const element of mounts) {
            if (element.isConnected && !inside(element, mounts)) {
                this.#safe(() => this.#mount(element, kept))
            }
        }
    }

    // Turbo Streams (incl. Mercure) mutate the DOM with no render lifecycle event,
    // so per-mount listeners never init on inserted content and cleanups never run
    // for removed content. Diff the DOM across the render and mirror the
    // Drive/frame mount-unmount, scoped to exactly the nodes that changed.
    #onBeforeStreamRender = (event: Event): void => {
        const detail = (event as CustomEvent<BeforeStreamRenderDetail>).detail
        const render = detail.render
        // Now, before Turbo swaps the permanent elements the stream keeps for copies:
        // it does once the stream message is in the page, before the render below
        const permanent = permanentElements(this.#getContainer(document))

        detail.render = async (streamElement: Element): Promise<void> => {
            if (isMorphStream(streamElement)) {
                // With morphMutations, turbo:before-morph-element sees what the morph
                // changes; without, its targets are re-mounted whole, like a frame
                const targets = (streamElement as Element & { targetElements?: Element[] }).targetElements ?? []
                await this.#morphing(
                    async () => {
                        await render(streamElement)
                        this.#restorePermanentElements(permanent)
                    },
                    this.#morphMutations ? targets.filter((target) => replacedByMorph(target, streamElement)) : targets
                )
                return
            }

            // Collect in the callback AND via takeRecords: `await render` yields a
            // microtask, so the observer may deliver (and drain) records before we
            // read them — takeRecords alone would come back empty.
            const records: MutationRecord[] = []
            const observer = new MutationObserver((list) => {
                records.push(...list)
            })
            observer.observe(this.#getContainer(document), { childList: true, subtree: true })

            await render(streamElement)

            records.push(...observer.takeRecords())
            observer.disconnect()

            this.#reconcile(records, this.#restorePermanentElements(permanent))
        }
    }

    /**
     * Mount/unmount exactly the nodes a Turbo Stream render touched.
     *
     * POLICY (mount-wins): a morph may report the same reused node as both
     * removed and added — we never unmount-then-remount it, and never
     * double-mount. Each callback is isolated so one throwing listener can't
     * abort the rest of the stream render.
     */
    #reconcile(records: MutationRecord[], kept: Element[]): void {
        const added = new Set<Element>()
        const removed = new Set<Element>()

        for (const record of records) {
            for (const node of record.removedNodes) {
                if (node instanceof Element) {
                    removed.add(node)
                }
            }
            for (const node of record.addedNodes) {
                if (node instanceof Element) {
                    added.add(node)
                }
            }
        }

        const ids = new Set(kept.map((element) => element.id))
        for (const node of removed) {
            if (added.has(node) || node.isConnected) {
                continue
            }
            // The copy of a permanent element put back in place of its copy: not mounted
            for (const copy of permanentElements(node)) {
                if (ids.has(copy.id) && !kept.includes(copy)) {
                    copy.remove()
                }
            }
            this.#safe(() => this.#unmount(node))
        }
        for (const node of added) {
            if (node.isConnected && !kept.includes(node)) {
                this.#safe(() => this.#mount(node, kept))
            }
        }
    }

    // Isolate a callback so one throwing listener can't abort the rest of a batch.
    #safe(action: () => void): void {
        try {
            action()
        } catch (error) {
            console.error(error)
        }
    }
}
