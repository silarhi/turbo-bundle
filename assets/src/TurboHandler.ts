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
     * Handle Turbo **morph** renders (Drive `turbo-refresh-method="morph"` and
     * `<turbo-frame refresh="morph">`) per-node instead of re-initializing the
     * whole container. When `true`, the coarse container unmount/mount is skipped
     * for morph renders and each element the morph changes in place (its
     * attributes or its own child nodes) is re-mounted via `turbo:morph-element`
     * — so listeners on nodes the morph preserved, and on the ancestors of the
     * changed ones, are left untouched. Defaults to `false` (faithful
     * whole-container re-init).
     *
     * Scope: covers elements morphed **in place**. Subtrees a morph adds or
     * removes wholesale are not re-mounted by this path. Requires `onMount` /
     * `onUnmount` to be safe to call on an individual element.
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
    // Elements the morph in flight changes, flagged on turbo:before-morph-element
    // while the new markup can still be compared with the old one.
    #morphedElements = new WeakSet<Element>()

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
            this.#bindings.push(
                { type: 'turbo:before-morph-element', handler: this.#onBeforeMorphElement },
                { type: 'turbo:morph-element', handler: this.#onMorphElement }
            )
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
        this.#started = false
        this.#initialLoad = true
        this.#bodyRendered = false
        this.#failedSubmissionRender = false
        this.#unmountedForCache = false
        this.#morphingFrames = new WeakSet()
        this.#morphedElements = new WeakSet()
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

    // A frame with `data-turbo-follow-redirect` opts into server-side redirect
    // following: tell the backend by echoing the intent as a request header.
    #onBeforeFetchRequest = (event: Event): void => {
        // Turbo loaded after start(): wrap its session before a frame navigation proposes a visit
        this.#wrapSessionVisit()

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
            this.#onMount(this.#getContainer(document))
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
            this.#onMount(this.#getContainer(document))
        }
        this.#initialLoad = false
        this.#bodyRendered = false
        this.#unmountedForCache = false
    }

    // Turbo clones the page into its snapshot cache one tick after this event, which
    // can come before turbo:before-render (the head merge waits for new stylesheets):
    // unmount now, so the snapshot holds the server DOM and not what listeners added
    // (a restored or previewed snapshot would otherwise get them twice). Not for a
    // promoted frame visit, which caches a copy taken when the frame navigation started
    // and renders nothing to re-mount after.
    #onBeforeCache = (): void => {
        if (isRenderlessVisit()) {
            return
        }
        this.#onUnmount(this.#getContainer(document))
        this.#unmountedForCache = true
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
        if (this.#isMorph(event) || isRenderlessVisit()) {
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

    // Turbo fires turbo:morph-element for every element the morph matched, the
    // unchanged ones and <body> included: flag the ones it changes, before it does.
    // A removed node comes without a newElement.
    #onBeforeMorphElement = (event: Event): void => {
        const element = event.target
        const newElement = (event as CustomEvent<BeforeMorphElementDetail>).detail?.newElement
        if (element instanceof Element && newElement instanceof Element && !morphKeeps(element, newElement)) {
            this.#morphedElements.add(element)
        }
    }

    // Each element the morph changed in place: refresh its listeners without
    // disturbing its ancestors and the siblings the morph left untouched.
    #onMorphElement = (event: Event): void => {
        const element = event.target
        if (!(element instanceof Element) || !this.#morphedElements.delete(element)) {
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
