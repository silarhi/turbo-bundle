/*
 * This file is part of the @silarhi/turbo package.
 *
 * (c) SILARHI <dev@silarhi.fr>
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

import {
    afterRender,
    aside,
    changes,
    inside,
    keptElements,
    morphKeeps,
    observe,
    outermost,
    PERMANENT_SELECTOR,
    permanentElements,
    restorePermanentElements,
    within,
} from './dom'
import { type NavigationOptions, navigationBindings, visit } from './navigation'
import { patchSessionVisit, patchSnapshotClone, type Unpatch } from './patches'
import {
    type BeforeMorphElementDetail,
    type BeforeStreamRenderDetail,
    type Binding,
    isFrameMorph,
    isMorphStream,
    isRenderlessVisit,
    MORPH_RENDER_METHOD,
    PREVIEW_ATTRIBUTE,
    type RenderDetail,
    replacedByMorph,
    streamTargets,
} from './turbo'

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

// One morph in flight: the elements it changes, unmounted before it does and
// mounted again once it is done, with what it added.
interface MorphScope {
    changed: Set<Element>
    // Stops watching the container, and returns what the morph added and removed
    stop: (() => MutationRecord[]) | null
}

/**
 * Wires the Turbo Drive / Frame / Stream lifecycle to a single pair of
 * mount/unmount callbacks, so framework code stays project-agnostic.
 *
 * Each render Turbo runs is wrapped: what it replaces is unmounted right before
 * it does, and what it puts in place mounted right after. The handler keeps the
 * elements it mounted, so a container is never mounted twice whatever the order
 * Turbo's events come in. Only the first page, which Turbo doesn't render, is
 * mounted on turbo:load.
 */
export class TurboHandler {
    readonly #onMount: (container: Element) => void
    readonly #onUnmount: (container: Element) => void
    readonly #getContainer: (document: Document) => Element
    readonly #streamMutations: boolean
    readonly #morphMutations: boolean
    readonly #navigation: NavigationOptions

    #started = false
    #bindings: Binding[] = []
    // What is mounted: the elements onMount was called on outside any other, and the
    // permanent elements left mounted when their container was unmounted. What is
    // inside one is mounted with it.
    #roots = new Set<Element>()
    // The markup of each permanent element before its first mount: the snapshot cache keeps it, not the widgets
    #pristine = new WeakMap<Element, Element>()
    #morph: MorphScope | null = null
    // Stops watching the streams already in the page when the handler started
    #pendingStreams: (() => MutationRecord[]) | null = null
    #unpatchSessionVisit: Unpatch | null = null
    #unpatchSnapshotClone: Unpatch | null = null

    constructor(options: TurboHandlerOptions) {
        this.#onMount = options.onMount
        this.#onUnmount = options.onUnmount
        this.#getContainer = options.getContainer ?? ((document) => document.body)
        this.#streamMutations = options.streamMutations ?? true
        this.#morphMutations = options.morphMutations ?? false
        this.#navigation = {
            onRedirect: options.onRedirect ?? visit,
            visitOnFrameMissing: options.visitOnFrameMissing ?? false,
            frameStreams: options.frameStreams ?? false,
        }
    }

    /** Attach every document listener. Idempotent — calling twice is a no-op. */
    start(): void {
        if (this.#started) {
            return
        }
        this.#started = true

        this.#bindings = [
            // Turbo loaded after start(): patch it before a frame navigation proposes a visit
            { type: 'turbo:before-fetch-request', handler: this.#patchTurbo },
            { type: 'turbo:load', handler: this.#onLoad },
            { type: 'turbo:before-cache', handler: this.#onBeforeCache },
            { type: 'turbo:before-render', handler: this.#onBeforeRender },
            { type: 'turbo:before-frame-render', handler: this.#onBeforeFrameRender },
            ...navigationBindings(this.#navigation),
        ]
        if (this.#streamMutations) {
            this.#bindings.push({ type: 'turbo:before-stream-render', handler: this.#onBeforeStreamRender })
        }
        if (this.#morphMutations) {
            this.#bindings.push({ type: 'turbo:before-morph-element', handler: this.#onBeforeMorphElement })
        }
        for (const { type, handler } of this.#bindings) {
            document.addEventListener(type, handler)
        }

        this.#patchTurbo()
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
        this.#unpatchSessionVisit?.()
        this.#unpatchSessionVisit = null
        this.#unpatchSnapshotClone?.()
        this.#unpatchSnapshotClone = null
        this.#morph?.stop?.()
        this.#morph = null
        this.#pendingStreams?.()
        this.#pendingStreams = null
        this.#roots = new Set()
        this.#started = false
    }

    #patchTurbo = (): void => {
        this.#unpatchSessionVisit ??= patchSessionVisit()
        this.#unpatchSnapshotClone ??= patchSnapshotClone(this.#pristine)
    }

    // Whether the node is mounted: a root, or inside one
    #isMounted(node: Node): boolean {
        return within(node, this.#roots)
    }

    // The roots inside the container, not the container itself
    #rootsIn(container: Element): Element[] {
        return [...this.#roots].filter((root) => root !== container && container.contains(root))
    }

    // onMount on the container. The permanent elements already mounted inside stay
    // so, set aside; what else was mounted inside is unmounted first, so each widget
    // is mounted once. A root is mounted already: nothing to do.
    #mount(container: Element): void {
        if (this.#roots.has(container)) {
            return
        }
        const roots = this.#rootsIn(container)
        const kept = roots.filter((root) => root.matches(PERMANENT_SELECTOR))
        const keptSet = new Set<Node>(kept)
        for (const root of outermost(roots.filter((root) => !within(root, keptSet)))) {
            this.#unmount(root, kept)
        }
        for (const element of permanentElements(container)) {
            if (!this.#pristine.has(element) && !within(element, keptSet)) {
                this.#pristine.set(element, element.cloneNode(true) as Element)
            }
        }

        this.#forget(container)
        if (!this.#isMounted(container)) {
            this.#roots.add(container)
        }
        aside(container, outermost(kept), this.#onMount)
    }

    // onUnmount on what is mounted in the container: the container itself, or else
    // the roots inside it. The kept elements stay mounted, set aside. `mounted` says
    // whether a container the page no longer has was.
    #unmount(container: Element, kept: Element[] = [], mounted = this.#isMounted(container)): void {
        const keptSet = new Set<Node>(kept)
        const targets = mounted
            ? [container]
            : outermost(this.#rootsIn(container).filter((root) => !within(root, keptSet)))
        for (const target of targets) {
            const keptInside = outermost(kept.filter((element) => element !== target && target.contains(element)))
            this.#forget(target)
            for (const element of keptInside) {
                this.#roots.add(element)
            }
            aside(target, keptInside, this.#onUnmount)
        }
    }

    // Drop the container and the roots inside it
    #forget(container: Element): void {
        for (const root of this.#roots) {
            if (container.contains(root)) {
                this.#roots.delete(root)
            }
        }
    }

    // The first page, which Turbo doesn't render, is mounted here; the renders the
    // handler wraps mount the next ones. Also mounts a container a visit unmounted
    // for the cache, then didn't render.
    #onLoad = (): void => {
        for (const root of this.#roots) {
            if (!root.isConnected) {
                this.#roots.delete(root)
            }
        }
        this.#mount(this.#getContainer(document))
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
        this.#unmount(container, permanentElements(container))
    }

    #onBeforeRender = (event: Event): void => {
        const detail = (event as CustomEvent<RenderDetail>).detail
        if (detail) {
            this.#wrapRender(
                detail,
                detail.renderMethod === MORPH_RENDER_METHOD,
                this.#getContainer(document),
                detail.newBody,
                // A preview of the cache stays unmounted: the render of the response follows
                () => (document.documentElement.hasAttribute(PREVIEW_ATTRIBUTE) ? null : this.#getContainer(document))
            )
        }
    }

    #onBeforeFrameRender = (event: Event): void => {
        const frame = event.target
        const detail = (event as CustomEvent<RenderDetail>).detail
        if (frame instanceof Element && detail) {
            const morph = detail.renderMethod === MORPH_RENDER_METHOD || isFrameMorph(detail, frame)
            this.#wrapRender(detail, morph, frame, detail.newFrame, () => frame)
        }
    }

    // Replace the function a Drive or frame render is about to run. With morphMutations,
    // a morph of a mounted container re-mounts what it changes only; any other render
    // unmounts the container, the permanent elements it keeps aside, and mounts the
    // target once done. Turbo calls it at the swap, when it is too late for a turbo:load
    // or a frame render that raced it to mount the old content in place of the new.
    #wrapRender(
        detail: RenderDetail,
        morph: boolean,
        container: Element,
        newElement: Element | undefined,
        target: () => Element | null
    ): void {
        const render = detail.render
        if (!render) {
            return
        }
        // Now, before Turbo swaps the permanent elements of the new content for placeholders;
        // a morph never removes one
        const kept = morph ? permanentElements(container) : keptElements(container, newElement)

        const handler = this
        detail.render = function (this: unknown, currentElement: Element, newElement: Element): unknown {
            const run = (): unknown => render.call(this, currentElement, newElement)
            if (morph && handler.#morphMutations && handler.#isMounted(container)) {
                return handler.#morphing(run)
            }

            handler.#safe(() => handler.#unmount(container, kept))
            return afterRender(run, () => {
                const element = target()
                if (element) {
                    handler.#safe(() => handler.#mount(element))
                }
            })
        }
    }

    // Turbo fires turbo:before-morph-element, before it morphs an element, for each
    // one the morph matched, the unchanged ones and <body> included, and for each
    // one it removes, without a newElement. Unmount the ones it changes or removes
    // now: once morphed, a widget would clean up into the new markup (Tom Select
    // puts back the options it found). Nothing inside an element already unmounted.
    #onBeforeMorphElement = (event: Event): void => {
        const element = event.target
        if (!(element instanceof Element) || !this.#isMounted(element)) {
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
        if (newElement) {
            // The morph leaves the permanent elements inside as they are
            scope.changed.add(element)
            this.#safe(() => this.#unmount(element, permanentElements(element)))
        } else {
            this.#safe(() => this.#unmount(element))
        }
    }

    // A morph Turbo runs outside a render or stream the handler wraps (a stream
    // with streamMutations off, a call to Turbo.morphElements): it runs at once, so
    // mount what it changed on the next microtask. What it added is left alone.
    #openLazyScope(): MorphScope {
        const scope: MorphScope = { changed: new Set(), stop: null }
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
        for (const element of changed) {
            this.#safe(() => this.#unmount(element, permanentElements(element)))
        }
        const scope: MorphScope = { changed: new Set(changed), stop: observe(this.#getContainer(document)) }
        this.#morph = scope

        return afterRender(render, () => this.#closeScope(scope))
    }

    #closeScope(scope: MorphScope): void {
        if (this.#morph !== scope) {
            return
        }
        this.#morph = null

        // idiomorph moves a node with a kept id through a hidden pantry: removed, then added
        const { added, parents } = changes(scope.stop?.() ?? [])
        const mounts = new Set<Element>(scope.changed)
        const moved: Element[] = []
        for (const node of added) {
            const parent = parents.get(node)
            if (!parent || within(parent, scope.changed)) {
                // Added, or moved out of an element unmounted with its listeners
                mounts.add(node)
            } else {
                moved.push(node)
            }
        }
        for (const node of moved) {
            // Moved, mounted, into an element mounted again below
            if (node.isConnected && inside(node, mounts)) {
                this.#safe(() => this.#unmount(node))
            }
        }
        for (const element of outermost(mounts)) {
            if (element.isConnected) {
                this.#safe(() => this.#mount(element))
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
        const mounted = permanent.filter((element) => this.#isMounted(element))
        const restore = (): Element[] => {
            const restored = restorePermanentElements(permanent)
            for (const element of restored) {
                if (mounted.includes(element)) {
                    this.#roots.add(element)
                }
            }

            return restored
        }

        detail.render = async (streamElement: Element): Promise<void> => {
            if (isMorphStream(streamElement)) {
                // With morphMutations, turbo:before-morph-element sees what the morph
                // changes; without, its targets are re-mounted whole, like a frame
                const targets = streamTargets(streamElement)
                await this.#morphing(
                    async () => {
                        await render(streamElement)
                        restore()
                    },
                    this.#morphMutations ? targets.filter((target) => replacedByMorph(target, streamElement)) : targets
                )
                return
            }

            const stop = observe(this.#getContainer(document))
            await render(streamElement)
            const records = stop()
            this.#reconcile(records, restore())
        }
    }

    // A <turbo-stream> in the page renders once Turbo defines the element, when it is
    // imported: before an app that imports Turbo first starts the handler, which never
    // sees its turbo:before-stream-render. Watch its targets until it is done, and
    // mount what it inserted, unmount what it removed.
    #watchPendingStreams(): void {
        const streams = customElements.get('turbo-stream') ? [...document.querySelectorAll('turbo-stream')] : []
        const targets = new Set<Node>(streams.flatMap(streamTargets))
        if (targets.size === 0) {
            return
        }

        const stop: () => MutationRecord[] = observe(this.#getContainer(document), () => {
            if (this.#pendingStreams !== stop || streams.some((stream) => stream.isConnected)) {
                return
            }
            this.#pendingStreams = null
            const records = stop().filter(
                (record) => within(record.target, targets) || [...record.removedNodes].some((node) => targets.has(node))
            )
            this.#reconcile(records, [])
        })
        this.#pendingStreams = stop
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
        const { added, parents } = changes(records)

        const ids = new Set(kept.map((element) => element.id))
        for (const [node, parent] of parents) {
            if (!(node instanceof Element) || added.has(node) || node.isConnected) {
                continue
            }
            // The copy of a permanent element put back in place of its copy: not mounted
            for (const copy of permanentElements(node)) {
                if (ids.has(copy.id) && !kept.includes(copy)) {
                    copy.remove()
                }
            }
            this.#safe(() => this.#unmount(node, [], this.#isMounted(node) || this.#isMounted(parent)))
        }
        for (const node of outermost(added)) {
            if (node.isConnected) {
                this.#safe(() => this.#mount(node))
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
