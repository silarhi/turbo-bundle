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

type Lifecycle = (container: Element | Document) => void

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
