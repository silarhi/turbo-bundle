/*
 * This file is part of the @silarhi/turbo package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { morphKeeps } from './dom'

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

export interface VisitOptions {
    willRender?: boolean
    shouldCacheSnapshot?: boolean
    [option: string]: unknown
}

export type SessionVisit = (location: unknown, options?: VisitOptions) => unknown

export type SnapshotClone = (this: { element: Element }) => { element: Element }

export type RenderElement = (currentElement: Element, newElement: Element) => unknown

// `turbo:before-render` / `turbo:before-frame-render` carry the render method
// ('morph' | 'replace') and the function that renders, which a listener can replace.
export interface RenderDetail {
    renderMethod?: string
    render?: RenderElement
    // The new <body> of turbo:before-render, the new frame of turbo:before-frame-render
    newBody?: Element
    newFrame?: Element
}

export interface BeforeMorphElementDetail {
    newElement?: Node
}

export interface BeforeStreamRenderDetail {
    render: (streamElement: Element) => Promise<void> | void
}

export interface Binding {
    type: string
    handler: EventListener
}

export const MORPH_RENDER_METHOD = 'morph'

// Set on <html> while Turbo renders a preview of a cached page, before the render of the response
export const PREVIEW_ATTRIBUTE = 'data-turbo-preview'

// A `data-turbo-action` frame navigation (advance / replace) is promoted to a page
// visit that only updates the URL: Turbo still fires turbo:before-cache, but with
// `willRender: false` it never replaces the <body>. Only a visit still in flight
// counts — once completed, the navigator keeps it as `currentVisit`.
export function isRenderlessVisit(): boolean {
    const currentVisit = window.Turbo?.session?.navigator?.currentVisit

    return currentVisit?.state === 'started' && currentVisit.willRender === false
}

// Turbo 8 reports a frame morph as a "replace": its MorphingFrameRenderer doesn't
// override renderMethod. Only a morph renders a frame with another function than
// the one of FrameRenderer, and only on a frame with refresh="morph".
export function isFrameMorph(detail: RenderDetail, frame: Element): boolean {
    const renderElement = window.Turbo?.FrameRenderer?.renderElement

    return (
        renderElement !== undefined &&
        frame.getAttribute('refresh') === MORPH_RENDER_METHOD &&
        detail.render !== renderElement
    )
}

// The elements a <turbo-stream> acts on
export function streamTargets(streamElement: Element): Element[] {
    return (streamElement as Element & { targetElements?: Element[] }).targetElements ?? []
}

// A stream that morphs its targets instead of replacing them: Turbo morphs them in
// place, which a diff of the child nodes alone doesn't see.
export function isMorphStream(streamElement: Element): boolean {
    const action = streamElement.getAttribute('action')

    return streamElement.getAttribute('method') === MORPH_RENDER_METHOD && (action === 'replace' || action === 'update')
}

// Whether a stream replace morph changes the target itself. Unmount it before the
// render then: Turbo stops the morph at the node after the target, which a widget
// may have inserted (a Tom Select's markup) and remove when unmounted mid-morph,
// leaving the morph to remove every node after it.
export function replacedByMorph(target: Element, streamElement: Element): boolean {
    const template = streamElement.firstElementChild
    const newElement = template instanceof HTMLTemplateElement ? template.content.firstElementChild : null

    return streamElement.getAttribute('action') === 'replace' && (!newElement || !morphKeeps(target, newElement))
}
