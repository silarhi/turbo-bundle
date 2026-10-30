/*
 * This file is part of the @silarhi/turbo package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { permanentElements } from './dom'
import type { SessionVisit, SnapshotClone, VisitOptions } from './turbo'

// Puts back what a patch replaced, unless something replaced it again since
export type Unpatch = () => void

// A frame navigation promoted to a page visit (`data-turbo-action`) caches a
// copy of the page Turbo 8 took when the navigation started, or Turbo 7 when the
// visit completes, while the page is still on screen: with what listeners added
// to it (a Tom Select's markup), as no turbo:before-cache cleanup can reach it.
// Back would restore that copy and mount the widgets a second time. Don't cache
// it: Back loads the page from the server instead, as after a Turbo 8 refresh.
// Turbo then no longer fires turbo:before-cache on a page that stays on screen
// either, which removed its [data-turbo-temporary] elements (hotwired/turbo#1553).
export function patchSessionVisit(): Unpatch | null {
    const session = window.Turbo?.session
    if (typeof session?.visit !== 'function') {
        return null
    }

    const original = session.visit
    const wrapper: SessionVisit = function (this: unknown, location: unknown, options: VisitOptions = {}): unknown {
        return original.call(
            this,
            location,
            options.willRender === false ? { ...options, shouldCacheSnapshot: false } : options
        )
    }
    session.visit = wrapper

    return () => {
        if (session.visit === wrapper) {
            session.visit = original
        }
    }
}

// The permanent elements stay mounted when the body is unmounted for the cache, so
// the copy Turbo caches holds their widgets. Put the markup they had before their
// first mount in that copy instead: a snapshot restored without them mounts it.
export function patchSnapshotClone(pristine: WeakMap<Element, Element>): Unpatch | null {
    const prototype = window.Turbo?.PageSnapshot?.prototype
    if (typeof prototype?.clone !== 'function') {
        return null
    }

    const original = prototype.clone
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

    return () => {
        if (prototype.clone === wrapper) {
            prototype.clone = original
        }
    }
}
