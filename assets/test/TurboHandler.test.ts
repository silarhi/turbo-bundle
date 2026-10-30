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

    describe('stream morphs', () => {
        function morphStream(action: string, target: Element): Element {
            const stream = document.createElement('turbo-stream')
            stream.setAttribute('action', action)
            stream.setAttribute('method', 'morph')
            Object.defineProperty(stream, 'targetElements', { value: [target] })

            return stream
        }

        it('re-mounts the whole target of a stream morph by default', async () => {
            const target = document.createElement('div')
            target.innerHTML = '<p>Old</p>'
            document.body.appendChild(target)
            const calls: string[] = []
            onUnmount.mockImplementation((container) => calls.push(`unmount ${container.tagName}`))
            onMount.mockImplementation((container) => calls.push(`mount ${container.tagName}`))

            const detail = {
                render: async (_streamElement: Element) => {
                    calls.push('render')
                    target.replaceChildren(document.createElement('ul'))
                },
            }
            fire('turbo:before-stream-render', detail)
            await detail.render(morphStream('update', target))

            expect(calls).toEqual(['unmount DIV', 'render', 'mount DIV'])
        })

        it('mounts what a stream morph adds outside its target, the target replaced', async () => {
            const target = document.createElement('div')
            document.body.appendChild(target)
            const added = document.createElement('section')

            const detail = {
                render: async (_streamElement: Element) => {
                    target.replaceWith(added)
                },
            }
            fire('turbo:before-stream-render', detail)
            await detail.render(morphStream('replace', target))

            expect(onUnmount.mock.calls).toEqual([[target]])
            expect(onMount.mock.calls).toEqual([[added]])
        })

        it('unmounts the target of a replace morph that changes before the render, with morphMutations', async () => {
            handler.stop()
            handler = new TurboHandler({ onMount, onUnmount, morphMutations: true })
            handler.start()
            const target = document.createElement('p')
            target.textContent = 'Old'
            document.body.appendChild(target)
            const stream = morphStream('replace', target)
            stream.innerHTML = '<template><p>New</p></template>'
            const calls: string[] = []
            onUnmount.mockImplementation(() => calls.push('unmount'))
            onMount.mockImplementation(() => calls.push('mount'))

            const detail = {
                render: async (_streamElement: Element) => {
                    calls.push('render')
                    target.textContent = 'New'
                },
            }
            fire('turbo:before-stream-render', detail)
            await detail.render(stream)

            expect(calls).toEqual(['unmount', 'render', 'mount'])
        })

        it('leaves a stream that replaces without morph to the node diff', async () => {
            const target = document.createElement('div')
            document.body.appendChild(target)
            const added = document.createElement('section')
            const stream = morphStream('replace', target)
            stream.removeAttribute('method')

            const detail = {
                render: async (_streamElement: Element) => {
                    target.replaceWith(added)
                },
            }
            fire('turbo:before-stream-render', detail)
            await detail.render(stream)

            expect(onUnmount.mock.calls).toEqual([[target]])
            expect(onMount.mock.calls).toEqual([[added]])
        })
    })

    describe('permanent elements', () => {
        const player = '<div id="player" data-turbo-permanent><p>Player</p></div>'

        // Whether each call saw the player inside its container, when it was made
        const seen = new Map<Mock<Lifecycle>, boolean[]>()
        function sawPlayer(callback: Mock<Lifecycle>): boolean[] {
            return seen.get(callback) ?? []
        }

        function body(html: string): Element {
            const element = document.createElement('body')
            element.innerHTML = html

            return element
        }

        beforeEach(() => {
            for (const callback of [onMount, onUnmount]) {
                const calls: boolean[] = []
                seen.set(callback, calls)
                callback.mockImplementation((container) => {
                    calls.push(container.querySelector('#player') !== null)
                })
            }
            document.body.innerHTML = `${player}<p id="other">Other</p>`
        })

        it('leaves the permanent elements the new page has out of the unmount and mount of a Drive render', () => {
            fire('turbo:load') // consume initialLoad
            const live = document.getElementById('player')

            fire('turbo:before-render', { newBody: body(player) })
            expect(sawPlayer(onUnmount)).toEqual([false])
            expect(document.getElementById('player')).toBe(live)

            fire('turbo:render', {})
            fire('turbo:load')
            expect(sawPlayer(onMount)).toEqual([true, false])
        })

        it('unmounts a permanent element the new page drops with the body', () => {
            fire('turbo:load') // consume initialLoad

            fire('turbo:before-render', { newBody: body('<p>No player</p>') })
            expect(sawPlayer(onUnmount)).toEqual([true])
        })

        it('leaves every permanent element mounted on a morph render', () => {
            fire('turbo:load') // consume initialLoad

            fire('turbo:before-render', { renderMethod: 'morph', newBody: body('<p>No player</p>') })
            expect(sawPlayer(onUnmount)).toEqual([false])
        })

        it('leaves the permanent elements a frame keeps out of its unmount and mount', () => {
            document.body.innerHTML = `<turbo-frame id="frame">${player}</turbo-frame>`
            const frame = document.getElementById('frame') as Element
            const newFrame = document.createElement('turbo-frame')
            newFrame.innerHTML = player

            frame.dispatchEvent(new CustomEvent('turbo:before-frame-render', { bubbles: true, detail: { newFrame } }))
            frame.dispatchEvent(new CustomEvent('turbo:frame-load', { bubbles: true }))

            expect(sawPlayer(onUnmount)).toEqual([false])
            expect(sawPlayer(onMount)).toEqual([false])
        })

        describe('snapshot cache', () => {
            class PageSnapshot {
                constructor(readonly element: Element) {}

                clone(): PageSnapshot {
                    return new PageSnapshot(this.element.cloneNode(true) as Element)
                }
            }
            const clone = PageSnapshot.prototype.clone

            beforeEach(() => {
                handler.stop()
                window.Turbo = { visit: vi.fn(), PageSnapshot }
                handler = new TurboHandler({ onMount, onUnmount })
                handler.start()
            })

            afterEach(() => {
                handler.stop()
                delete window.Turbo
            })

            it('caches the markup a permanent element had before its first mount', () => {
                fire('turbo:load')
                document.querySelector('#player p')?.append(document.createElement('span'))

                const snapshot = new PageSnapshot(document.body).clone()
                expect(snapshot.element.querySelector('#player')?.innerHTML).toBe('<p>Player</p>')
                expect(snapshot.element.querySelector('#other')).not.toBeNull()
            })

            it('leaves the permanent elements mounted for the cache, and unmounts the ones the new page drops', () => {
                fire('turbo:load')
                const live = document.getElementById('player') as Element

                fire('turbo:before-cache')
                expect(sawPlayer(onUnmount)).toEqual([false])

                fire('turbo:before-render', { newBody: body('<p>No player</p>') })
                expect(onUnmount).toHaveBeenLastCalledWith(live)
            })

            it('mounts the body around the permanent elements left mounted for the cache', () => {
                fire('turbo:load')

                fire('turbo:before-cache')
                fire('turbo:before-render', { newBody: body(player) })
                fire('turbo:render', {})
                fire('turbo:load')

                expect(sawPlayer(onMount)).toEqual([true, false])
            })

            it('puts the snapshot clone back on stop()', () => {
                expect(PageSnapshot.prototype.clone).not.toBe(clone)
                handler.stop()
                expect(PageSnapshot.prototype.clone).toBe(clone)
            })
        })

        it('puts back a permanent element a stream swapped for a copy, mounted', async () => {
            document.body.innerHTML = `<section id="section">${player}<p>Old</p></section>`
            const live = document.getElementById('player') as Element
            const section = document.getElementById('section') as Element
            const newSection = document.createElement('section')
            newSection.innerHTML = `${player}<p>New</p>`

            const detail = {
                render: async (_streamElement: Element) => {
                    // What Turbo does: a copy of the element in the new content, the element itself out of the page
                    live.replaceWith(live.cloneNode(true))
                    section.replaceWith(newSection)
                },
            }
            fire('turbo:before-stream-render', detail)
            await detail.render(document.createElement('turbo-stream'))

            expect(document.getElementById('player')).toBe(live)
            expect(newSection.contains(live)).toBe(true)
            expect(onUnmount.mock.calls).toEqual([[section]])
            expect(sawPlayer(onUnmount)).toEqual([false])
            expect(onMount.mock.calls).toEqual([[newSection]])
            expect(sawPlayer(onMount)).toEqual([false])
        })
    })

    describe('renders racing the first turbo:load', () => {
        function frameRender(frame: Element): { render: (current: Element, next: Element) => void } {
            const detail = { render: (_current: Element, _next: Element): void => {} }
            frame.dispatchEvent(new CustomEvent('turbo:before-frame-render', { bubbles: true, detail }))

            return detail
        }

        it('mounts a frame once when the first turbo:load comes after its content is swapped in', () => {
            const frame = document.createElement('turbo-frame')
            document.body.appendChild(frame)

            frameRender(frame).render(frame, frame)
            fire('turbo:load')
            frame.dispatchEvent(new CustomEvent('turbo:frame-load', { bubbles: true }))

            expect(onMount.mock.calls).toEqual([[document.body]])
        })

        it('unmounts the old content of a frame the first turbo:load mounted before the swap', () => {
            const frame = document.createElement('turbo-frame')
            document.body.appendChild(frame)

            const detail = frameRender(frame)
            fire('turbo:load')
            onUnmount.mockClear()
            detail.render(frame, frame)
            frame.dispatchEvent(new CustomEvent('turbo:frame-load', { bubbles: true }))

            expect(onUnmount.mock.calls).toEqual([[frame]])
            expect(onMount.mock.calls).toEqual([[document.body], [frame]])
        })

        it('unmounts a frame loaded before the first turbo:load, before mounting the body', () => {
            const frame = document.createElement('turbo-frame')
            document.body.appendChild(frame)

            frameRender(frame).render(frame, frame)
            frame.dispatchEvent(new CustomEvent('turbo:frame-load', { bubbles: true }))
            fire('turbo:load')

            // Once before its render, once before the body mount
            expect(onUnmount.mock.calls).toEqual([[frame], [frame]])
            expect(onMount.mock.calls).toEqual([[frame], [document.body]])
        })

        it('mounts what a stream already in the page inserts, before the handler started', async () => {
            handler.stop()
            if (!customElements.get('turbo-stream')) {
                customElements.define(
                    'turbo-stream',
                    class extends HTMLElement {
                        get targetElements(): Element[] {
                            return [document.getElementById(this.getAttribute('target') ?? '') as Element]
                        }
                    }
                )
            }
            document.body.innerHTML = '<ul id="list"></ul><turbo-stream target="list"></turbo-stream>'
            handler = new TurboHandler({ onMount, onUnmount })
            handler.start()
            const item = document.createElement('li')

            document.getElementById('list')?.append(item)
            document.querySelector('turbo-stream')?.remove()
            await new Promise((resolve) => setTimeout(resolve))

            expect(onMount.mock.calls).toEqual([[item]])
        })
    })

    describe('morph mutations (opt-in)', () => {
        function startMorphHandler(): void {
            handler.stop()
            handler = new TurboHandler({ onMount, onUnmount, morphMutations: true })
            handler.start()
        }

        // What Turbo dispatches before it morphs an element (with the new markup) or removes it (without)
        function beforeMorph(element: Element, newHtml?: string): void {
            const template = document.createElement('template')
            template.innerHTML = newHtml ?? ''
            const newElement = newHtml === undefined ? undefined : template.content.firstElementChild
            element.dispatchEvent(
                new CustomEvent('turbo:before-morph-element', {
                    bubbles: true,
                    cancelable: true,
                    detail: { currentElement: element, newElement },
                })
            )
        }

        // A morph Turbo runs on its own: what it changed is mounted on the next microtask
        async function morph(element: Element, newHtml?: string): Promise<void> {
            beforeMorph(element, newHtml)
            await Promise.resolve()
        }

        function element(html: string): Element {
            document.body.insertAdjacentHTML('beforeend', html)

            return document.body.lastElementChild as Element
        }

        it('re-mounts an element whose attributes the morph changes', async () => {
            startMorphHandler()
            const el = element('<p data-count="0">Count</p>')

            await morph(el, '<p data-count="1">Count</p>')
            expect(onUnmount).toHaveBeenCalledWith(el)
            expect(onMount).toHaveBeenCalledWith(el)
        })

        it('re-mounts an element the morph adds an attribute to', async () => {
            startMorphHandler()
            const el = element('<p>Count</p>')

            await morph(el, '<p data-count="1">Count</p>')
            expect(onUnmount).toHaveBeenCalledWith(el)
            expect(onMount).toHaveBeenCalledWith(el)
        })

        it('re-mounts an element whose own text the morph changes', async () => {
            startMorphHandler()
            const el = element('<p>Count 0</p>')

            await morph(el, '<p>Count 1</p>')
            expect(onMount).toHaveBeenCalledWith(el)
        })

        it('re-mounts an element the morph removes a listener addition from', async () => {
            startMorphHandler()
            const el = element('<p>Widget<span class="badge">mounted</span></p>')

            await morph(el, '<p>Widget</p>')
            expect(onMount).toHaveBeenCalledWith(el)
        })

        it('leaves an element the morph keeps as it is alone', async () => {
            startMorphHandler()
            const el = element('<p class="a" data-x="1">Stable <b>text</b></p>')

            await morph(el, '<p data-x="1" class="a">Stable <b>text</b></p>')
            expect(onUnmount).not.toHaveBeenCalled()
            expect(onMount).not.toHaveBeenCalled()
        })

        it('leaves an ancestor alone when only a descendant changes', async () => {
            startMorphHandler()
            const el = element('<div><p>Count 0</p></div>')

            // Its child element keeps its tag: the change is the child's, on its own event
            await morph(el, '<div><p>Count 1</p></div>')
            expect(onMount).not.toHaveBeenCalled()
        })

        it('re-mounts an ancestor whose child elements the morph replaces', async () => {
            startMorphHandler()
            const el = element('<div><p>Old</p></div>')

            await morph(el, '<div><ul><li>New</li></ul></div>')
            expect(onMount).toHaveBeenCalledWith(el)
        })

        it('unmounts an element the morph removes', async () => {
            startMorphHandler()
            const el = element('<p>Removed</p>')

            await morph(el)
            expect(onUnmount.mock.calls).toEqual([[el]])
            expect(onMount).not.toHaveBeenCalled()
        })

        it('unmounts a changed element before the morph, and mounts it once the morph is done', async () => {
            startMorphHandler()
            const el = element('<p>Count 0</p>')

            beforeMorph(el, '<p>Count 1</p>')
            expect(onUnmount).toHaveBeenCalledWith(el)
            expect(onMount).not.toHaveBeenCalled()
            el.textContent = 'Count 1'
            await Promise.resolve()

            expect(onMount.mock.calls).toEqual([[el]])
        })

        it('skips the elements inside one the morph already unmounted', async () => {
            startMorphHandler()
            const el = element('<div><p>Count 0</p></div>')
            const child = el.firstElementChild as Element

            beforeMorph(el, '<div><p>Count 1</p><p>New</p></div>')
            beforeMorph(child, '<p>Count 1</p>')
            await Promise.resolve()

            expect(onUnmount.mock.calls).toEqual([[el]])
            expect(onMount.mock.calls).toEqual([[el]])
        })

        it('ignores the morph events on a body already unmounted for the cache', async () => {
            startMorphHandler()
            const el = element('<p>Count 0</p>')
            fire('turbo:before-cache')
            onUnmount.mockClear()

            await morph(el, '<p>Count 1</p>')
            expect(onUnmount).not.toHaveBeenCalled()
            expect(onMount).not.toHaveBeenCalled()
        })

        describe('a Drive morph render', () => {
            it('skips the coarse body unmount/mount', () => {
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

            it('mounts what the render changed and added once it is done, and unmounts what it removed', async () => {
                startMorphHandler()
                fire('turbo:load') // consume initialLoad
                const changed = element('<p>Count 0</p>')
                const removed = element('<p>Old</p>')
                const kept = element('<p>Kept</p>')
                onMount.mockClear()
                const added = document.createElement('section')
                added.innerHTML = '<p>New</p>'

                const detail = {
                    renderMethod: 'morph',
                    render: (_currentElement: Element, _newElement: Element): void => {
                        beforeMorph(changed, '<p>Count 1</p>')
                        changed.textContent = 'Count 1'
                        beforeMorph(kept, '<p>Kept</p>')
                        beforeMorph(removed)
                        removed.replaceWith(added)
                        expect(onMount).not.toHaveBeenCalled()
                    },
                }
                fire('turbo:before-render', detail)
                detail.render(document.body, document.createElement('body'))

                expect(onUnmount.mock.calls).toEqual([[changed], [removed]])
                expect(onMount.mock.calls).toEqual([[changed], [added]])
            })

            it('mounts a node the morph moved out of a changed element, not one it moved elsewhere', () => {
                startMorphHandler()
                fire('turbo:load') // consume initialLoad
                const changed = element('<div><p id="out">Out</p></div>')
                const list = element('<ul><li id="a"></li><li id="b"></li></ul>')
                const out = document.getElementById('out') as Element
                const b = document.getElementById('b') as Element
                onMount.mockClear()

                const detail = {
                    renderMethod: 'morph',
                    render: (): void => {
                        beforeMorph(changed, '<div></div>')
                        changed.after(out)
                        list.prepend(b)
                    },
                }
                fire('turbo:before-render', detail)
                detail.render()

                expect(onMount.mock.calls).toEqual([[changed], [out]])
            })

            it('unmounts a node the morph moved into a changed element before mounting that element', () => {
                startMorphHandler()
                fire('turbo:load') // consume initialLoad
                const changed = element('<div></div>')
                const moving = element('<p id="in">In</p>')
                onMount.mockClear()

                const detail = {
                    renderMethod: 'morph',
                    render: (): void => {
                        beforeMorph(changed, '<div><p id="in">In</p></div>')
                        changed.append(moving)
                    },
                }
                fire('turbo:before-render', detail)
                detail.render()

                expect(onUnmount.mock.calls).toEqual([[changed], [moving]])
                expect(onMount.mock.calls).toEqual([[changed]])
            })

            it('closes the morph when the render throws', () => {
                startMorphHandler()
                fire('turbo:load') // consume initialLoad
                const changed = element('<p>Count 0</p>')
                const error = new Error('render failed')
                onMount.mockClear()

                const detail = {
                    renderMethod: 'morph',
                    render: (): void => {
                        beforeMorph(changed, '<p>Count 1</p>')
                        throw error
                    },
                }
                fire('turbo:before-render', detail)

                expect(() => detail.render()).toThrow(error)
                expect(onMount.mock.calls).toEqual([[changed]])
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
        })

        describe('a frame morph render', () => {
            const frameRenderer = { renderElement: (): void => {} }

            beforeEach(() => {
                window.Turbo = { visit: vi.fn(), FrameRenderer: frameRenderer }
            })

            afterEach(() => {
                delete window.Turbo
            })

            function frameRender(frame: Element, detail: object): void {
                frame.dispatchEvent(new CustomEvent('turbo:before-frame-render', { bubbles: true, detail }))
                frame.dispatchEvent(new CustomEvent('turbo:frame-load', { bubbles: true }))
            }

            it('skips the coarse frame unmount/mount when Turbo reports a morph', () => {
                startMorphHandler()
                const frame = element('<turbo-frame id="live"></turbo-frame>')

                frameRender(frame, { renderMethod: 'morph' })

                expect(onUnmount).not.toHaveBeenCalled()
                expect(onMount).not.toHaveBeenCalled()
            })

            it('tells a morph Turbo reports as a replace by its render function', () => {
                startMorphHandler()
                const frame = element('<turbo-frame id="live" refresh="morph"></turbo-frame>')

                frameRender(frame, { renderMethod: 'replace', render: () => {} })

                expect(onUnmount).not.toHaveBeenCalled()
                expect(onMount).not.toHaveBeenCalled()
            })

            it('re-mounts a frame with refresh="morph" that Turbo replaces', () => {
                startMorphHandler()
                const frame = element('<turbo-frame id="live" refresh="morph"></turbo-frame>')

                frameRender(frame, { renderMethod: 'replace', render: frameRenderer.renderElement })

                expect(onUnmount.mock.calls).toEqual([[frame]])
                expect(onMount.mock.calls).toEqual([[frame]])
            })
        })

        it('ignores turbo:before-morph-element unless opted in', async () => {
            const el = element('<p data-count="0"></p>')

            await morph(el, '<p data-count="1"></p>')
            expect(onMount).not.toHaveBeenCalled()
            expect(onUnmount).not.toHaveBeenCalled()
        })
    })
})
