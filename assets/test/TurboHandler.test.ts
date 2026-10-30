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

    describe('submissions that do not render the body directly', () => {
        it.each([
            ['a successful submission', { success: true, fetchResponse: { contentType: 'text/html' } }],
            ['a failed non-HTML submission', { success: false, fetchResponse: { contentType: 'application/json' } }],
            ['a failed submission without a response', { success: false }],
        ])('waits for turbo:load after %s', (_label, detail) => {
            fire('turbo:load') // initial
            onMount.mockClear()

            fire('turbo:submit-end', { ...detail, formSubmission: { fetchRequest: { headers: {} } } })
            fire('turbo:render')
            expect(onMount).not.toHaveBeenCalled()

            fire('turbo:load')
            expect(onMount.mock.calls).toEqual([[document.body]])
        })

        it('does not mount the body for a failed submission inside a frame', () => {
            fire('turbo:load') // initial
            onMount.mockClear()

            fire('turbo:submit-end', {
                success: false,
                fetchResponse: { contentType: 'text/html; charset=utf-8' },
                formSubmission: { fetchRequest: { headers: { 'Turbo-Frame': 'crud-form' } } },
            })
            fire('turbo:render')

            expect(onMount).not.toHaveBeenCalled()
        })
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

    describe('snapshot of promoted frame visits', () => {
        type Visit = (location: unknown, options?: Record<string, unknown>) => unknown

        function turboSession(): { session: { visit: Visit }; original: Mock<Visit> } {
            const original = vi.fn<Visit>()
            const session = { visit: original as Visit }
            window.Turbo = { visit: vi.fn(), session }

            return { session, original }
        }

        afterEach(() => {
            delete window.Turbo
        })

        it('keeps a visit that renders nothing out of the snapshot cache', () => {
            const { session, original } = turboSession()
            handler.stop()
            handler.start()

            session.visit('/list?q=foo', { action: 'advance', willRender: false })
            session.visit('/second', { action: 'advance' })

            expect(original.mock.calls).toEqual([
                ['/list?q=foo', { action: 'advance', willRender: false, shouldCacheSnapshot: false }],
                ['/second', { action: 'advance' }],
            ])
            // Called as a method of the session
            expect(original.mock.contexts[0]).toBe(session)
        })

        it('wraps a Turbo loaded after start() before its first fetch', () => {
            const { session, original } = turboSession()
            fire('turbo:before-fetch-request', { fetchOptions: { headers: {} } })

            session.visit('/list?q=foo', { willRender: false })

            expect(original).toHaveBeenCalledWith('/list?q=foo', { willRender: false, shouldCacheSnapshot: false })
        })

        it('wraps the session once', () => {
            const { session } = turboSession()
            handler.stop()
            handler.start()
            const wrapper = session.visit
            fire('turbo:before-fetch-request', { fetchOptions: { headers: {} } })

            expect(session.visit).toBe(wrapper)
        })

        it('puts the session visit back on stop()', () => {
            const { session, original } = turboSession()
            handler.stop()
            handler.start()
            handler.stop()

            expect(session.visit).toBe(original)
        })

        it('leaves a visit wrapped again by something else on stop()', () => {
            const { session } = turboSession()
            handler.stop()
            handler.start()
            const other: Visit = vi.fn()
            session.visit = other
            handler.stop()

            expect(session.visit).toBe(other)
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

    it('lets a response without Turbo-Location through', () => {
        const onRedirect = vi.fn<(url: string) => void>()
        handler.stop()
        handler = new TurboHandler({ onMount, onUnmount, onRedirect })
        handler.start()

        const event = fire('turbo:before-fetch-response', { fetchResponse: { response: { headers: new Headers() } } })

        expect(onRedirect).not.toHaveBeenCalled()
        expect(event.defaultPrevented).toBe(false)
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

    it('leaves the headers of a non-frame request untouched', () => {
        const frame = document.createElement('turbo-frame')
        frame.id = 'opted_in'
        frame.setAttribute('data-turbo-follow-redirect', '')
        document.body.append(frame)

        const headers: Record<string, string> = { Accept: 'text/html' }
        fire('turbo:before-fetch-request', { fetchOptions: { headers } })

        expect(headers).toEqual({ Accept: 'text/html' })
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

    it('attaches its listeners only once when started twice', () => {
        handler.start()

        fire('turbo:load')
        expect(onMount.mock.calls).toEqual([[document.body]])

        handler.stop()
        fire('turbo:before-render')
        expect(onUnmount).not.toHaveBeenCalled()
    })

    it('ignores lifecycle events that do not target an element', () => {
        handler.stop()
        handler = new TurboHandler({ onMount, onUnmount, morphMutations: true })
        handler.start()

        // Dispatched on the document itself: there is no frame / morphed element to act on
        fire('turbo:frame-load')
        fire('turbo:before-frame-render')
        fire('turbo:morph-element')

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

        it('mounts a node the render moved without unmounting it, and skips text nodes', async () => {
            const moved = document.createElement('article')
            const target = document.createElement('div')
            document.body.append(moved, target)

            const detail = {
                render: async (_streamElement: Element) => {
                    // A morph reusing a node reports it as both removed and added
                    const text = document.createTextNode('text')
                    target.append(moved, text)
                    text.remove()
                },
            }
            fire('turbo:before-stream-render', detail)
            await detail.render(document.createElement('turbo-stream'))

            expect(onUnmount).not.toHaveBeenCalled()
            expect(onMount.mock.calls).toEqual([[moved]])
        })

        it('keeps mounting the other nodes when a listener throws, and logs the error', async () => {
            const error = new Error('listener failed')
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
            const first = document.createElement('div')
            const second = document.createElement('div')
            onMount.mockImplementation((container) => {
                if (container === first) {
                    throw error
                }
            })

            const detail = {
                render: async (_streamElement: Element) => {
                    document.body.append(first, second)
                },
            }
            fire('turbo:before-stream-render', detail)
            await detail.render(document.createElement('turbo-stream'))

            expect(onMount.mock.calls).toEqual([[first], [second]])
            expect(consoleError).toHaveBeenCalledWith(error)
            consoleError.mockRestore()
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

        // What Turbo dispatches around the morph of one element: before (with the new markup), then after
        function morph(element: Element, newHtml?: string): void {
            const template = document.createElement('template')
            template.innerHTML = newHtml ?? ''
            const newElement = newHtml === undefined ? undefined : template.content.firstElementChild
            element.dispatchEvent(
                new CustomEvent('turbo:before-morph-element', {
                    bubbles: true,
                    cancelable: true,
                    detail: { newElement },
                })
            )
            element.dispatchEvent(new CustomEvent('turbo:morph-element', { bubbles: true, detail: { newElement } }))
        }

        function element(html: string): Element {
            document.body.insertAdjacentHTML('beforeend', html)

            return document.body.lastElementChild as Element
        }

        it('re-mounts an element whose attributes the morph changes', () => {
            startMorphHandler()
            const el = element('<p data-count="0">Count</p>')

            morph(el, '<p data-count="1">Count</p>')
            expect(onUnmount).toHaveBeenCalledWith(el)
            expect(onMount).toHaveBeenCalledWith(el)
        })

        it('re-mounts an element the morph adds an attribute to', () => {
            startMorphHandler()
            const el = element('<p>Count</p>')

            morph(el, '<p data-count="1">Count</p>')
            expect(onUnmount).toHaveBeenCalledWith(el)
            expect(onMount).toHaveBeenCalledWith(el)
        })

        it('re-mounts an element whose own text the morph changes', () => {
            startMorphHandler()
            const el = element('<p>Count 0</p>')

            morph(el, '<p>Count 1</p>')
            expect(onMount).toHaveBeenCalledWith(el)
        })

        it('re-mounts an element the morph removes a listener addition from', () => {
            startMorphHandler()
            const el = element('<p>Widget<span class="badge">mounted</span></p>')

            morph(el, '<p>Widget</p>')
            expect(onMount).toHaveBeenCalledWith(el)
        })

        it('leaves an element the morph keeps as it is alone', () => {
            startMorphHandler()
            const el = element('<p class="a" data-x="1">Stable <b>text</b></p>')

            morph(el, '<p data-x="1" class="a">Stable <b>text</b></p>')
            expect(onUnmount).not.toHaveBeenCalled()
            expect(onMount).not.toHaveBeenCalled()
        })

        it('leaves an ancestor alone when only a descendant changes', () => {
            startMorphHandler()
            const el = element('<div><p>Count 0</p></div>')

            // Its child element keeps its tag: the change is the child's, on its own event
            morph(el, '<div><p>Count 1</p></div>')
            expect(onMount).not.toHaveBeenCalled()
        })

        it('re-mounts an ancestor whose child elements the morph replaces', () => {
            startMorphHandler()
            const el = element('<div><p>Old</p></div>')

            morph(el, '<div><ul><li>New</li></ul></div>')
            expect(onMount).toHaveBeenCalledWith(el)
        })

        it('ignores turbo:morph-element without a turbo:before-morph-element that saw a change', () => {
            startMorphHandler()
            const el = element('<p>Removed</p>')

            // A node Turbo removes: turbo:before-morph-element without a newElement
            morph(el)
            el.dispatchEvent(new CustomEvent('turbo:morph-element', { bubbles: true, detail: {} }))
            expect(onMount).not.toHaveBeenCalled()
        })

        it('re-mounts an element once per morph', () => {
            startMorphHandler()
            const el = element('<p>Count 0</p>')

            morph(el, '<p>Count 1</p>')
            el.dispatchEvent(new CustomEvent('turbo:morph-element', { bubbles: true, detail: {} }))
            expect(onMount).toHaveBeenCalledTimes(1)
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
            const el = element('<p data-count="0"></p>')

            morph(el, '<p data-count="1"></p>')
            expect(onMount).not.toHaveBeenCalled()
            expect(onUnmount).not.toHaveBeenCalled()
        })
    })
})
