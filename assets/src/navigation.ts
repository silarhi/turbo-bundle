/*
 * This file is part of the @silarhi/turbo package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import type { Binding } from './turbo'

interface BeforeFetchRequestDetail {
    fetchOptions: { headers: Record<string, string> }
}

interface BeforeFetchResponseDetail {
    fetchResponse: { response: { headers: Headers } }
}

interface FrameMissingDetail {
    response: Response
    visit: (location: Response | string) => Promise<void> | void
}

interface FrameRenderDetail {
    fetchResponse?: { responseHTML: Promise<string | undefined> }
}

export interface NavigationOptions {
    onRedirect: (url: string) => void
    visitOnFrameMissing: boolean
    frameStreams: boolean
}

const FRAME_HEADER = 'Turbo-Frame'
const FOLLOW_REDIRECT_HEADER = 'Turbo-Frame-Follow-Redirect'
const LOCATION_HEADER = 'Turbo-Location'
const FOLLOW_REDIRECT_ATTRIBUTE = 'data-turbo-follow-redirect'

// The listeners of the frame responses: the redirects the server turns into a
// Turbo-Location, and the opt-in handling of a missing frame and of the streams
// a frame response carries. None of them mounts anything.
export function navigationBindings(options: NavigationOptions): Binding[] {
    const bindings: Binding[] = [
        { type: 'turbo:before-fetch-request', handler: followRedirectHeader },
        {
            type: 'turbo:before-fetch-response',
            handler: (event) => followTurboLocation(event, options.onRedirect),
        },
    ]
    if (options.visitOnFrameMissing) {
        bindings.push({ type: 'turbo:frame-missing', handler: visitMissingFrame })
    }
    if (options.frameStreams) {
        bindings.push({ type: 'turbo:frame-render', handler: runFrameStreams })
    }

    return bindings
}

// Default `onRedirect`: a Drive visit through the global `@hotwired/turbo` sets
// when imported. Without it, a full page load still reaches the target, where
// doing nothing would leave the page as it was after the response was cancelled.
export function visit(url: string): void {
    if (window.Turbo) {
        window.Turbo.visit(url)
        return
    }

    console.warn(`@silarhi/turbo: window.Turbo is not defined, loading ${url} without Turbo Drive.`)
    window.location.assign(url)
}

// A frame with `data-turbo-follow-redirect` opts into server-side redirect
// following: tell the backend by echoing the intent as a request header.
function followRedirectHeader(event: Event): void {
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
function followTurboLocation(event: Event, onRedirect: (url: string) => void): void {
    const { fetchResponse } = (event as CustomEvent<BeforeFetchResponseDetail>).detail
    const location = fetchResponse.response.headers.get(LOCATION_HEADER)
    if (!location) {
        return
    }

    event.preventDefault()
    onRedirect(location)
}

// The frame response has no matching <turbo-frame> (e.g. an expired session
// redirecting to a login page): render it as a full page instead of letting
// Turbo write an error into the frame and throw.
function visitMissingFrame(event: Event): void {
    const { response, visit } = (event as CustomEvent<FrameMissingDetail>).detail
    event.preventDefault()
    visit(response)
}

// The frame swapped in its own content only: run the response's layout-level
// streams, outside any frame (the ones inside the rendered frame came in
// with it, and Turbo ran them on insertion). Connecting a <turbo-stream> to
// the document performs its action; the stream render hook then mounts what
// it inserted.
async function runFrameStreams(event: Event): Promise<void> {
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
