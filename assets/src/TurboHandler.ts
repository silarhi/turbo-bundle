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
        Turbo?: { visit: (location: string) => void }
    }
}

export interface TurboHandlerOptions {
    /** Mount your per-container listeners on a freshly rendered/inserted element. */
    onMount: (container: Element | Document) => void
    /** Tear down the listeners previously mounted on a container before it leaves the DOM. */
    onUnmount: (container: Element | Document) => void
    /**
     * Resolve the root element a full Turbo Drive render mounts on.
     * Defaults to `document.body`.
     */
    getContainer?: (document: Document) => Element
    /**
     * Follow a server-issued `Turbo-Location` redirect (pairs with the PHP
     * `TurboFrameListener`). Defaults to `Turbo.visit(url)`.
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
     * Handle Turbo **morph** renders (Drive `turbo-refresh-method="morph"` and
     * `<turbo-frame refresh="morph">`) per-node instead of re-initializing the
     * whole container. When `true`, the coarse container unmount/mount is skipped
     * for morph renders and each morphed-in-place element is re-mounted via
     * `turbo:morph-element` — so listeners on nodes the morph preserved are left
     * untouched. Defaults to `false` (faithful whole-container re-init).
     *
     * Scope: covers elements morphed **in place**. Subtrees a morph adds or
     * removes wholesale are not re-mounted by this path. Requires `onMount` /
     * `onUnmount` to be safe to call on an individual element.
     */
    morphMutations?: boolean
}

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

interface BeforeStreamRenderDetail {
    render: (streamElement: Element) => Promise<void> | void
}

// `turbo:before-render` / `turbo:render` / `turbo:before-frame-render` all carry
// the render method ('morph' | 'replace') on their detail.
interface RenderDetail {
    renderMethod?: string
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

/**
 * Wires the Turbo Drive / Frame / Stream lifecycle to a single pair of
 * mount/unmount callbacks, so framework code stays project-agnostic.
 *
 * The DOM-event wiring below is the single source of truth for when listeners
 * init and clean up — mirror your app's `mount(container)` / `unmount(container)`
 * onto `onMount` / `onUnmount`.
 */
export class TurboHandler {
    readonly #onMount: (container: Element | Document) => void
    readonly #onUnmount: (container: Element | Document) => void
    readonly #getContainer: (document: Document) => Element
    readonly #onRedirect: (url: string) => void
    readonly #streamMutations: boolean
    readonly #morphMutations: boolean

    #started = false
    #initialLoad = true
    #bodyRendered = false
    #failedSubmissionRender = false
    #bindings: Binding[] = []
    // Frames whose in-flight render is a morph — so turbo:frame-load (which
    // carries no renderMethod) knows to skip the coarse mount.
    #morphingFrames = new WeakSet<Element>()

    constructor(options: TurboHandlerOptions) {
        this.#onMount = options.onMount
        this.#onUnmount = options.onUnmount
        this.#getContainer = options.getContainer ?? ((document) => document.body)
        this.#onRedirect = options.onRedirect ?? ((url) => window.Turbo?.visit(url))
        this.#streamMutations = options.streamMutations ?? true
        this.#morphMutations = options.morphMutations ?? false
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
        ]

        if (this.#streamMutations) {
            this.#bindings.push({ type: 'turbo:before-stream-render', handler: this.#onBeforeStreamRender })
        }

        if (this.#morphMutations) {
            this.#bindings.push({ type: 'turbo:morph-element', handler: this.#onMorphElement })
        }

        for (const { type, handler } of this.#bindings) {
            document.addEventListener(type, handler)
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
        this.#started = false
        this.#initialLoad = true
        this.#bodyRendered = false
        this.#failedSubmissionRender = false
        this.#morphingFrames = new WeakSet()
    }

    // A frame with `data-turbo-follow-redirect` opts into server-side redirect
    // following: tell the backend by echoing the intent as a request header.
    #onBeforeFetchRequest = (event: Event): void => {
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
            this.#onMount(this.#getContainer(document))
            return
        }
        if (this.#isMorph(event)) {
            // Morph preserves the <body> in place; turbo:morph-element handles the
            // changed nodes, so don't let turbo:load re-mount the whole body.
            return
        }
        this.#bodyRendered = true
    }

    // A `data-turbo-action="advance"` frame navigation also fires turbo:load (to
    // advance the URL) but with willRender: false — gating on a real render (or
    // the very first load) stops it re-mounting the whole body on itself.
    #onLoad = (): void => {
        if (this.#initialLoad || this.#bodyRendered) {
            this.#onMount(this.#getContainer(document))
        }
        this.#initialLoad = false
        this.#bodyRendered = false
    }

    #onFrameLoad = (event: Event): void => {
        const frame = event.target
        if (!(frame instanceof Element)) {
            return
        }
        if (this.#morphingFrames.delete(frame)) {
            // Morph frame render: turbo:morph-element already refreshed the changes.
            return
        }
        this.#onMount(frame)
    }

    #onBeforeRender = (event: Event): void => {
        if (this.#isMorph(event)) {
            return
        }
        this.#onUnmount(this.#getContainer(document))
    }

    #onBeforeFrameRender = (event: Event): void => {
        const frame = event.target
        if (!(frame instanceof Element)) {
            return
        }
        if (this.#isMorph(event)) {
            this.#morphingFrames.add(frame)
            return
        }
        this.#onUnmount(frame)
    }

    // True only when opted into morphMutations AND Turbo reports a morph render.
    #isMorph(event: Event): boolean {
        return this.#morphMutations && (event as CustomEvent<RenderDetail>).detail?.renderMethod === MORPH_RENDER_METHOD
    }

    // Each element Turbo morphs in place: refresh its listeners without disturbing
    // the siblings the morph left untouched.
    #onMorphElement = (event: Event): void => {
        const element = event.target
        if (!(element instanceof Element)) {
            return
        }
        this.#safe(() => this.#onUnmount(element))
        this.#safe(() => this.#onMount(element))
    }

    // Turbo Streams (incl. Mercure) mutate the DOM with no render lifecycle event,
    // so per-mount listeners never init on inserted content and cleanups never run
    // for removed content. Diff the DOM across the render and mirror the
    // Drive/frame mount-unmount, scoped to exactly the nodes that changed.
    #onBeforeStreamRender = (event: Event): void => {
        const detail = (event as CustomEvent<BeforeStreamRenderDetail>).detail
        const render = detail.render

        detail.render = async (streamElement: Element): Promise<void> => {
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

            this.#reconcile(records)
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
    #reconcile(records: MutationRecord[]): void {
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

        for (const node of removed) {
            if (!added.has(node)) {
                this.#safe(() => this.#onUnmount(node))
            }
        }
        for (const node of added) {
            this.#safe(() => this.#onMount(node))
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
