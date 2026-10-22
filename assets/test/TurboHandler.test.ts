/*
 * This file is part of the @silarhi/turbo package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { TurboHandler } from '../src/index'

type Lifecycle = (container: Element) => void

function fire<T>(type: string, detail?: T): CustomEvent<T> {
    const event = new CustomEvent(type, { detail, cancelable: true })
    document.dispatchEvent(event)

    return event
}

describe('TurboHandler', () => {
    let onMount: Mock<Lifecycle>
    let onUnmount: Mock<Lifecycle>
    let handler: TurboHandler

    beforeEach(() => {
        document.body.innerHTML = ''
        onMount = vi.fn<Lifecycle>()
        onUnmount = vi.fn<Lifecycle>()
        handler = new TurboHandler({ onMount, onUnmount })
        handler.start()
    })

    afterEach(() => {
        handler.stop()
    })

    it('mounts the body on the initial turbo:load', () => {
        fire('turbo:load')
        expect(onMount).toHaveBeenCalledWith(document.body)
    })

    it('unmounts the body before a Drive render', () => {
        fire('turbo:before-render')
        expect(onUnmount).toHaveBeenCalledWith(document.body)
    })

    it('mounts a frame on turbo:frame-load and unmounts it before re-render', () => {
        const frame = document.createElement('turbo-frame')
        document.body.appendChild(frame)

        frame.dispatchEvent(new CustomEvent('turbo:frame-load', { bubbles: true }))
        expect(onMount).toHaveBeenCalledWith(frame)

        frame.dispatchEvent(new CustomEvent('turbo:before-frame-render', { bubbles: true }))
        expect(onUnmount).toHaveBeenCalledWith(frame)
    })

    it('ignores a frame-advance turbo:load (willRender false) after the first load', () => {
        fire('turbo:load') // initial load consumes initialLoad
        onMount.mockClear()

        fire('turbo:load') // frame advance: no preceding turbo:render
        expect(onMount).not.toHaveBeenCalled()
    })

    it('mounts after a real Drive render (turbo:render then turbo:load)', () => {
        fire('turbo:load') // initial
        onMount.mockClear()

        fire('turbo:render')
        fire('turbo:load')
        expect(onMount).toHaveBeenCalledWith(document.body)
    })

    it('mounts the body when a failed submission renders without a visit', () => {
        fire('turbo:load') // initial
        onMount.mockClear()

        fire('turbo:submit-end', {
            success: false,
            fetchResponse: { contentType: 'text/html; charset=utf-8' },
            formSubmission: { fetchRequest: { headers: {} } },
        })
        fire('turbo:render')
        expect(onMount).toHaveBeenCalledWith(document.body)
    })

    describe('snapshot cache', () => {
        it('unmounts the body before Turbo snapshots it', () => {
            fire('turbo:load') // initial

            fire('turbo:before-cache')

            expect(onUnmount).toHaveBeenCalledWith(document.body)
        })

        it('mounts the body on the next turbo:load even without a render that mounts it', () => {
            fire('turbo:load') // initial
            onMount.mockClear()

            // A morph refresh with morphMutations: no coarse mount from turbo:render
            fire('turbo:before-cache')
            fire('turbo:load')

            expect(onMount).toHaveBeenCalledWith(document.body)
        })

        it('mounts the body once after a cached visit that renders', () => {
            fire('turbo:load') // initial
            onMount.mockClear()

            fire('turbo:before-cache')
            fire('turbo:before-render', { renderMethod: 'replace' })
            fire('turbo:render', { renderMethod: 'replace' })
            fire('turbo:load')

            expect(onMount.mock.calls).toEqual([[document.body]])
        })
    })

    describe('promoted frame visits (data-turbo-action)', () => {
        function currentVisit(state: string, willRender: boolean): void {
            window.Turbo = { visit: vi.fn(), session: { navigator: { currentVisit: { state, willRender } } } }
        }

        afterEach(() => {
            delete window.Turbo
        })

        it('re-mounts only the frame, not the body, when the visit only advances the URL', () => {
            fire('turbo:load') // initial
            onMount.mockClear()
            const frame = document.createElement('turbo-frame')
            document.body.appendChild(frame)

            // What Turbo 8 dispatches for an advance frame navigation: the frame render, then a
            // page visit with willRender false that still fires the page render events
            frame.dispatchEvent(new CustomEvent('turbo:before-frame-render', { bubbles: true }))
            frame.dispatchEvent(new CustomEvent('turbo:frame-load', { bubbles: true }))
            currentVisit('started', false)
            fire('turbo:before-render', { renderMethod: 'replace' })
            fire('turbo:render', { renderMethod: 'replace' })
            fire('turbo:load')

            expect(onUnmount.mock.calls).toEqual([[frame]])
            expect(onMount.mock.calls).toEqual([[frame]])
        })

        it('still mounts a failed submission rendered after a completed renderless visit', () => {
            fire('turbo:load') // initial
            onMount.mockClear()
            // The navigator keeps the last visit, here a finished frame promotion
            currentVisit('completed', false)

            fire('turbo:submit-end', {
                success: false,
                fetchResponse: { contentType: 'text/html; charset=utf-8' },
                formSubmission: { fetchRequest: { headers: {} } },
            })
            fire('turbo:before-render', { renderMethod: 'replace' })
            fire('turbo:render', { renderMethod: 'replace' })

            expect(onUnmount).toHaveBeenCalledWith(document.body)
            expect(onMount).toHaveBeenCalledWith(document.body)
        })

        it('leaves the page mounted when a promoted frame visit caches its snapshot', () => {
            fire('turbo:load') // initial
            onMount.mockClear()
            currentVisit('started', false)

            fire('turbo:before-cache')
            fire('turbo:before-render', { renderMethod: 'replace' })
            fire('turbo:render', { renderMethod: 'replace' })
            fire('turbo:load')

            expect(onUnmount).not.toHaveBeenCalled()
            expect(onMount).not.toHaveBeenCalled()
        })

        it('re-mounts the body for a visit that renders', () => {
            fire('turbo:load') // initial
            onMount.mockClear()
            currentVisit('started', true)

            fire('turbo:before-render', { renderMethod: 'replace' })
            fire('turbo:render', { renderMethod: 'replace' })
            fire('turbo:load')

            expect(onUnmount).toHaveBeenCalledWith(document.body)
            expect(onMount).toHaveBeenCalledWith(document.body)
        })
    })

    it('follows a Turbo-Location redirect and prevents the default frame swap', () => {
        const onRedirect = vi.fn<(url: string) => void>()
        handler.stop()
        handler = new TurboHandler({ onMount, onUnmount, onRedirect })
        handler.start()

        const headers = new Headers({ 'Turbo-Location': '/next' })
        const event = fire('turbo:before-fetch-response', { fetchResponse: { response: { headers } } })

        expect(onRedirect).toHaveBeenCalledWith('/next')
        expect(event.defaultPrevented).toBe(true)
    })

    describe('default onRedirect', () => {
        const headers = () => new Headers({ 'Turbo-Location': '/next' })

        afterEach(() => {
            vi.unstubAllGlobals()
            vi.restoreAllMocks()
            delete window.Turbo
        })

        it('visits the Turbo-Location with the Turbo global', () => {
            const visit = vi.fn<(location: string) => void>()
            window.Turbo = { visit }

            fire('turbo:before-fetch-response', { fetchResponse: { response: { headers: headers() } } })

            expect(visit).toHaveBeenCalledWith('/next')
        })

        it('falls back to a full page load and warns without the Turbo global', () => {
            const assign = vi.fn<(url: string) => void>()
            vi.stubGlobal('location', { assign })
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

            const event = fire('turbo:before-fetch-response', { fetchResponse: { response: { headers: headers() } } })

            expect(assign).toHaveBeenCalledWith('/next')
            expect(warn).toHaveBeenCalledOnce()
            expect(event.defaultPrevented).toBe(true)
        })
    })

    it('accepts callbacks typed for Element | Document', () => {
        // BC: the callbacks used to be typed (container: Element | Document) => void
        const wide = vi.fn<(container: Element | Document) => void>()
        handler.stop()
        handler = new TurboHandler({ onMount: wide, onUnmount: wide })
        handler.start()

        fire('turbo:load')
        expect(wide).toHaveBeenCalledWith(document.body)
    })

    it('visits the response of a missing frame when visitOnFrameMissing is enabled', () => {
        handler.stop()
        handler = new TurboHandler({ onMount, onUnmount, visitOnFrameMissing: true })
        handler.start()

        const response = new Response('<html></html>')
        const visit = vi.fn()
        const event = fire('turbo:frame-missing', { response, visit })

        expect(visit).toHaveBeenCalledWith(response)
        expect(event.defaultPrevented).toBe(true)
    })

    it('leaves turbo:frame-missing to Turbo by default', () => {
        const visit = vi.fn()
        const event = fire('turbo:frame-missing', { response: new Response(''), visit })

        expect(visit).not.toHaveBeenCalled()
        expect(event.defaultPrevented).toBe(false)
    })

    it('adds the follow-redirect header only for opted-in frames', () => {
        const optedIn = document.createElement('turbo-frame')
        optedIn.id = 'opted_in'
        optedIn.setAttribute('data-turbo-follow-redirect', '')
        const plain = document.createElement('turbo-frame')
        plain.id = 'plain'
        document.body.append(optedIn, plain)

        const optedInHeaders: Record<string, string> = { 'Turbo-Frame': 'opted_in' }
        fire('turbo:before-fetch-request', { fetchOptions: { headers: optedInHeaders } })
        expect(optedInHeaders['Turbo-Frame-Follow-Redirect']).toBe('1')

        const plainHeaders: Record<string, string> = { 'Turbo-Frame': 'plain' }
        fire('turbo:before-fetch-request', { fetchOptions: { headers: plainHeaders } })
        expect(plainHeaders['Turbo-Frame-Follow-Redirect']).toBeUndefined()
    })

    it('uses a custom getContainer for body renders', () => {
        handler.stop()
        const root = document.createElement('main')
        document.body.appendChild(root)
        handler = new TurboHandler({ onMount, onUnmount, getContainer: () => root })
        handler.start()

        fire('turbo:load')
        expect(onMount).toHaveBeenCalledWith(root)
    })

    it('stops listening after stop()', () => {
        handler.stop()

        fire('turbo:load')
        fire('turbo:before-render')
        expect(onMount).not.toHaveBeenCalled()
        expect(onUnmount).not.toHaveBeenCalled()
    })

    describe('frame streams (opt-in)', () => {
        const RESPONSE = `<html><body>
            <turbo-stream action="append" target="flash-alerts"><template><div class="alert">Saved</div></template></turbo-stream>
            <turbo-frame id="crud-form"><turbo-stream action="update" target="inner"><template>x</template></turbo-stream>Form</turbo-frame>
            <turbo-frame id="other"><turbo-stream action="remove" target="elsewhere"></turbo-stream></turbo-frame>
        </body></html>`

        function renderFrame(id: string, responseHTML: string | undefined): HTMLElement {
            const frame = document.createElement('turbo-frame')
            frame.id = id
            document.body.appendChild(frame)
            frame.dispatchEvent(
                new CustomEvent('turbo:frame-render', {
                    bubbles: true,
                    detail: { fetchResponse: { responseHTML: Promise.resolve(responseHTML) } },
                })
            )

            return frame
        }

        function appendedStreams(): string[] {
            return [...document.body.querySelectorAll(':scope > turbo-stream')].map(
                (stream) => `${stream.getAttribute('action')}#${stream.getAttribute('target')}`
            )
        }

        it('ignores the streams of a frame response by default', async () => {
            renderFrame('crud-form', RESPONSE)
            await Promise.resolve()

            expect(appendedStreams()).toEqual([])
        })

        it('runs the streams living outside any frame', async () => {
            handler.stop()
            handler = new TurboHandler({ onMount, onUnmount, frameStreams: true })
            handler.start()

            renderFrame('crud-form', RESPONSE)

            await vi.waitFor(() => expect(appendedStreams()).toEqual(['append#flash-alerts']))
            expect(document.body.querySelector(':scope > turbo-stream template')?.innerHTML).toBe(
                '<div class="alert">Saved</div>'
            )
        })

        it('does nothing without a response body', async () => {
            handler.stop()
            handler = new TurboHandler({ onMount, onUnmount, frameStreams: true })
            handler.start()

            renderFrame('crud-form', undefined)
            await Promise.resolve()

            expect(appendedStreams()).toEqual([])
        })
    })

    describe('stream mutations (morph)', () => {
        it('mounts inserted nodes and unmounts removed nodes by default', async () => {
            const removed = document.createElement('div')
            document.body.appendChild(removed)
            const added = document.createElement('section')

            const detail = {
                render: async (_streamElement: Element) => {
                    document.body.appendChild(added)
                    removed.remove()
                },
            }
            fire('turbo:before-stream-render', detail)
            await detail.render(document.createElement('turbo-stream'))

            expect(onMount).toHaveBeenCalledWith(added)
            expect(onUnmount).toHaveBeenCalledWith(removed)
        })

        it('leaves stream rendering untouched when streamMutations is false', () => {
            handler.stop()
            handler = new TurboHandler({ onMount, onUnmount, streamMutations: false })
            handler.start()

            const original = vi.fn(async () => {})
            const detail = { render: original }
            fire('turbo:before-stream-render', detail)

            expect(detail.render).toBe(original)
        })
    })

    describe('morph mutations (opt-in)', () => {
        function startMorphHandler(): void {
            handler.stop()
            handler = new TurboHandler({ onMount, onUnmount, morphMutations: true })
            handler.start()
        }

        it('re-mounts each element morphed in place via turbo:morph-element', () => {
            startMorphHandler()
            const el = document.createElement('div')
            document.body.appendChild(el)

            el.dispatchEvent(new CustomEvent('turbo:morph-element', { bubbles: true, detail: {} }))
            expect(onUnmount).toHaveBeenCalledWith(el)
            expect(onMount).toHaveBeenCalledWith(el)
        })

        it('skips the coarse body unmount/mount on a Drive morph render', () => {
            startMorphHandler()
            fire('turbo:load') // consume initialLoad
            onMount.mockClear()
            onUnmount.mockClear()

            fire('turbo:before-render', { renderMethod: 'morph' })
            fire('turbo:render', { renderMethod: 'morph' })
            fire('turbo:load')

            expect(onUnmount).not.toHaveBeenCalled()
            expect(onMount).not.toHaveBeenCalled()
        })

        it('still re-mounts the whole body on a non-morph (replace) render', () => {
            startMorphHandler()
            fire('turbo:load') // consume initialLoad
            onMount.mockClear()
            onUnmount.mockClear()

            fire('turbo:before-render', { renderMethod: 'replace' })
            fire('turbo:render', { renderMethod: 'replace' })
            fire('turbo:load')

            expect(onUnmount).toHaveBeenCalledWith(document.body)
            expect(onMount).toHaveBeenCalledWith(document.body)
        })

        it('skips the coarse frame unmount/mount on a morph frame render', () => {
            startMorphHandler()
            const frame = document.createElement('turbo-frame')
            document.body.appendChild(frame)

            frame.dispatchEvent(
                new CustomEvent('turbo:before-frame-render', { bubbles: true, detail: { renderMethod: 'morph' } })
            )
            frame.dispatchEvent(new CustomEvent('turbo:frame-load', { bubbles: true }))

            expect(onUnmount).not.toHaveBeenCalled()
            expect(onMount).not.toHaveBeenCalled()
        })

        it('ignores turbo:morph-element unless opted in', () => {
            const el = document.createElement('div')
            document.body.appendChild(el)

            el.dispatchEvent(new CustomEvent('turbo:morph-element', { bubbles: true, detail: {} }))
            expect(onMount).not.toHaveBeenCalled()
            expect(onUnmount).not.toHaveBeenCalled()
        })
    })
})
