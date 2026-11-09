// src/dom.ts
const PERMANENT_SELECTOR = "[id][data-turbo-permanent]";
function permanentElements(root) {
	return [...root.matches("[id][data-turbo-permanent]") ? [root] : [], ...root.querySelectorAll(PERMANENT_SELECTOR)];
}
function keptElements(container, newElement) {
	if (!newElement) return [];
	const ids = new Set(permanentElements(newElement).map((element) => element.id));
	return permanentElements(container).filter((element) => ids.has(element.id));
}
function restorePermanentElements(elements) {
	const restored = [];
	for (const element of elements) {
		if (element.isConnected) continue;
		const copy = document.getElementById(element.id);
		if (copy && copy !== element && copy.matches("[id][data-turbo-permanent]")) {
			copy.replaceWith(element);
			restored.push(element);
		}
	}
	return restored;
}
function morphKeeps(element, newElement) {
	if (element.tagName !== newElement.tagName || element.attributes.length !== newElement.attributes.length) return false;
	for (const { name, value } of element.attributes) if (newElement.getAttribute(name) !== value) return false;
	const children = element.childNodes;
	const newChildren = newElement.childNodes;
	if (children.length !== newChildren.length) return false;
	return [...children].every((child, index) => {
		const newChild = newChildren[index];
		if (child instanceof Element) return newChild instanceof Element && child.tagName === newChild.tagName;
		return child.nodeType === newChild.nodeType && child.nodeValue === newChild.nodeValue;
	});
}
function inside(node, elements) {
	for (let parent = node.parentNode; parent; parent = parent.parentNode) if (elements.has(parent)) return true;
	return false;
}
function within(node, elements) {
	return elements.has(node) || inside(node, elements);
}
function outermost(elements) {
	const set = new Set(elements);
	return [...elements].filter((element) => !inside(element, set));
}
function move(parent, node, before) {
	const moveBefore = parent.moveBefore;
	if (moveBefore) try {
		moveBefore.call(parent, node, before);
		return;
	} catch {}
	parent.insertBefore(node, before);
}
function aside(container, elements, callback) {
	const moved = elements.filter((element) => element !== container && container.contains(element));
	if (moved.length === 0) {
		callback(container);
		return;
	}
	const holder = document.createElement("div");
	holder.hidden = true;
	document.documentElement.append(holder);
	const places = moved.map((element) => {
		const place = document.createComment("");
		element.before(place);
		move(holder, element, null);
		return [place, element];
	});
	try {
		callback(container);
	} finally {
		for (const [place, element] of places) {
			if (place.parentNode) move(place.parentNode, element, place);
			place.remove();
		}
		holder.remove();
	}
}
function observe(root, onRecords) {
	const records = [];
	const observer = new MutationObserver((list) => {
		records.push(...list);
		onRecords?.();
	});
	observer.observe(root, {
		childList: true,
		subtree: true
	});
	return () => {
		records.push(...observer.takeRecords());
		observer.disconnect();
		return records;
	};
}
function changes(records) {
	const added = /* @__PURE__ */ new Set();
	const parents = /* @__PURE__ */ new Map();
	for (const record of records) {
		for (const node of record.removedNodes) if (!parents.has(node)) parents.set(node, record.target);
		for (const node of record.addedNodes) if (node instanceof Element) added.add(node);
	}
	return {
		added,
		parents
	};
}
function afterRender(render, callback) {
	let result;
	try {
		result = render();
	} catch (error) {
		callback();
		throw error;
	}
	if (result instanceof Promise) return result.finally(callback);
	callback();
	return result;
}
// src/navigation.ts
const FRAME_HEADER = "Turbo-Frame";
const FOLLOW_REDIRECT_HEADER = "Turbo-Frame-Follow-Redirect";
const LOCATION_HEADER = "Turbo-Location";
const FOLLOW_REDIRECT_ATTRIBUTE = "data-turbo-follow-redirect";
function navigationBindings(options) {
	const bindings = [{
		type: "turbo:before-fetch-request",
		handler: followRedirectHeader
	}, {
		type: "turbo:before-fetch-response",
		handler: (event) => followTurboLocation(event, options.onRedirect)
	}];
	if (options.visitOnFrameMissing) bindings.push({
		type: "turbo:frame-missing",
		handler: visitMissingFrame
	});
	if (options.frameStreams) bindings.push({
		type: "turbo:frame-render",
		handler: runFrameStreams
	});
	return bindings;
}
function visit(url) {
	if (window.Turbo) {
		window.Turbo.visit(url);
		return;
	}
	console.warn(`@silarhi/turbo: window.Turbo is not defined, loading ${url} without Turbo Drive.`);
	window.location.assign(url);
}
function followRedirectHeader(event) {
	const { fetchOptions } = event.detail;
	const frameId = fetchOptions.headers[FRAME_HEADER];
	if (!frameId) return;
	if (!document.getElementById(frameId)?.hasAttribute(FOLLOW_REDIRECT_ATTRIBUTE)) return;
	fetchOptions.headers[FOLLOW_REDIRECT_HEADER] = "1";
}
function followTurboLocation(event, onRedirect) {
	const { fetchResponse } = event.detail;
	const location = fetchResponse.response.headers.get(LOCATION_HEADER);
	if (!location) return;
	event.preventDefault();
	onRedirect(location);
}
function visitMissingFrame(event) {
	const { response, visit } = event.detail;
	event.preventDefault();
	visit(response);
}
async function runFrameStreams(event) {
	const html = await event.detail?.fetchResponse?.responseHTML;
	if (!html) return;
	const response = new DOMParser().parseFromString(html, "text/html");
	for (const stream of response.querySelectorAll("turbo-stream")) if (!stream.closest("turbo-frame")) document.body.append(document.importNode(stream, true));
}
// src/patches.ts
function patchSessionVisit() {
	const session = window.Turbo?.session;
	if (typeof session?.visit !== "function") return null;
	const original = session.visit;
	const wrapper = function(location, options = {}) {
		return original.call(this, location, options.willRender === false ? {
			...options,
			shouldCacheSnapshot: false
		} : options);
	};
	session.visit = wrapper;
	return () => {
		if (session.visit === wrapper) session.visit = original;
	};
}
function patchSnapshotClone(pristine) {
	const prototype = window.Turbo?.PageSnapshot?.prototype;
	if (typeof prototype?.clone !== "function") return null;
	const original = prototype.clone;
	const wrapper = function() {
		const snapshot = original.call(this);
		const elements = permanentElements(this.element);
		for (const [index, copy] of permanentElements(snapshot.element).entries()) {
			const markup = elements[index] && pristine.get(elements[index]);
			if (markup) copy.replaceWith(markup.cloneNode(true));
		}
		return snapshot;
	};
	prototype.clone = wrapper;
	return () => {
		if (prototype.clone === wrapper) prototype.clone = original;
	};
}
// src/turbo.ts
const MORPH_RENDER_METHOD = "morph";
function isRenderlessVisit() {
	const currentVisit = window.Turbo?.session?.navigator?.currentVisit;
	return currentVisit?.state === "started" && currentVisit.willRender === false;
}
function isFrameMorph(detail, frame) {
	const renderElement = window.Turbo?.FrameRenderer?.renderElement;
	return renderElement !== void 0 && frame.getAttribute("refresh") === "morph" && detail.render !== renderElement;
}
function streamTargets(streamElement) {
	return streamElement.targetElements ?? [];
}
function isMorphStream(streamElement) {
	const action = streamElement.getAttribute("action");
	return streamElement.getAttribute("method") === "morph" && (action === "replace" || action === "update");
}
function replacedByMorph(target, streamElement) {
	const template = streamElement.firstElementChild;
	const newElement = template instanceof HTMLTemplateElement ? template.content.firstElementChild : null;
	return streamElement.getAttribute("action") === "replace" && (!newElement || !morphKeeps(target, newElement));
}
// src/TurboHandler.ts
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
var TurboHandler = class {
	#onMount;
	#onUnmount;
	#getContainer;
	#streamMutations;
	#morphMutations;
	#navigation;
	#started = false;
	#bindings = [];
	#roots = /* @__PURE__ */ new Set();
	#pristine = /* @__PURE__ */ new WeakMap();
	#morph = null;
	#pendingStreams = null;
	#unpatchSessionVisit = null;
	#unpatchSnapshotClone = null;
	constructor(options) {
		this.#onMount = options.onMount;
		this.#onUnmount = options.onUnmount;
		this.#getContainer = options.getContainer ?? ((document) => document.body);
		this.#streamMutations = options.streamMutations ?? true;
		this.#morphMutations = options.morphMutations ?? false;
		this.#navigation = {
			onRedirect: options.onRedirect ?? visit,
			visitOnFrameMissing: options.visitOnFrameMissing ?? false,
			frameStreams: options.frameStreams ?? false
		};
	}
	/** Attach every document listener. Idempotent — calling twice is a no-op. */
	start() {
		if (this.#started) return;
		this.#started = true;
		this.#bindings = [
			{
				type: "turbo:before-fetch-request",
				handler: this.#patchTurbo
			},
			{
				type: "turbo:load",
				handler: this.#onLoad
			},
			{
				type: "turbo:before-cache",
				handler: this.#onBeforeCache
			},
			{
				type: "turbo:before-render",
				handler: this.#onBeforeRender
			},
			{
				type: "turbo:before-frame-render",
				handler: this.#onBeforeFrameRender
			},
			...navigationBindings(this.#navigation)
		];
		if (this.#streamMutations) this.#bindings.push({
			type: "turbo:before-stream-render",
			handler: this.#onBeforeStreamRender
		});
		if (this.#morphMutations) this.#bindings.push({
			type: "turbo:before-morph-element",
			handler: this.#onBeforeMorphElement
		});
		for (const { type, handler } of this.#bindings) document.addEventListener(type, handler);
		this.#patchTurbo();
		if (this.#streamMutations) this.#watchPendingStreams();
	}
	/** Detach every document listener and reset to a pre-boot state. Idempotent. */
	stop() {
		if (!this.#started) return;
		for (const { type, handler } of this.#bindings) document.removeEventListener(type, handler);
		this.#bindings = [];
		this.#unpatchSessionVisit?.();
		this.#unpatchSessionVisit = null;
		this.#unpatchSnapshotClone?.();
		this.#unpatchSnapshotClone = null;
		this.#morph?.stop?.();
		this.#morph = null;
		this.#pendingStreams?.();
		this.#pendingStreams = null;
		this.#roots = /* @__PURE__ */ new Set();
		this.#started = false;
	}
	#patchTurbo = () => {
		this.#unpatchSessionVisit ??= patchSessionVisit();
		this.#unpatchSnapshotClone ??= patchSnapshotClone(this.#pristine);
	};
	#isMounted(node) {
		return within(node, this.#roots);
	}
	#rootsIn(container) {
		return [...this.#roots].filter((root) => root !== container && container.contains(root));
	}
	#mount(container) {
		if (this.#roots.has(container)) return;
		const roots = this.#rootsIn(container);
		const kept = roots.filter((root) => root.matches(PERMANENT_SELECTOR));
		const keptSet = new Set(kept);
		for (const root of outermost(roots.filter((root) => !within(root, keptSet)))) this.#unmount(root, kept);
		for (const element of permanentElements(container)) if (!this.#pristine.has(element) && !within(element, keptSet)) this.#pristine.set(element, element.cloneNode(true));
		this.#forget(container);
		if (!this.#isMounted(container)) this.#roots.add(container);
		aside(container, outermost(kept), this.#onMount);
	}
	#unmount(container, kept = [], mounted = this.#isMounted(container)) {
		const keptSet = new Set(kept);
		const targets = mounted ? [container] : outermost(this.#rootsIn(container).filter((root) => !within(root, keptSet)));
		for (const target of targets) {
			const keptInside = outermost(kept.filter((element) => element !== target && target.contains(element)));
			this.#forget(target);
			for (const element of keptInside) this.#roots.add(element);
			aside(target, keptInside, this.#onUnmount);
		}
	}
	#forget(container) {
		for (const root of this.#roots) if (container.contains(root)) this.#roots.delete(root);
	}
	#onLoad = () => {
		for (const root of this.#roots) if (!root.isConnected) this.#roots.delete(root);
		this.#mount(this.#getContainer(document));
	};
	#onBeforeCache = () => {
		if (isRenderlessVisit()) return;
		const container = this.#getContainer(document);
		this.#unmount(container, permanentElements(container));
	};
	#onBeforeRender = (event) => {
		const detail = event.detail;
		if (detail) this.#wrapRender(detail, detail.renderMethod === MORPH_RENDER_METHOD, this.#getContainer(document), detail.newBody, () => document.documentElement.hasAttribute("data-turbo-preview") ? null : this.#getContainer(document));
	};
	#onBeforeFrameRender = (event) => {
		const frame = event.target;
		const detail = event.detail;
		if (frame instanceof Element && detail) {
			const morph = detail.renderMethod === "morph" || isFrameMorph(detail, frame);
			this.#wrapRender(detail, morph, frame, detail.newFrame, () => frame);
		}
	};
	#wrapRender(detail, morph, container, newElement, target) {
		const render = detail.render;
		if (!render) return;
		const kept = morph ? permanentElements(container) : keptElements(container, newElement);
		const handler = this;
		detail.render = function(currentElement, newElement) {
			const run = () => render.call(this, currentElement, newElement);
			if (morph && handler.#morphMutations && handler.#isMounted(container)) return handler.#morphing(run);
			handler.#safe(() => handler.#unmount(container, kept));
			return afterRender(run, () => {
				const element = target();
				if (element) handler.#safe(() => handler.#mount(element));
			});
		};
	}
	#onBeforeMorphElement = (event) => {
		const element = event.target;
		if (!(element instanceof Element) || !this.#isMounted(element)) return;
		const newElement = event.detail?.newElement;
		if (newElement instanceof Element && morphKeeps(element, newElement)) return;
		const scope = this.#morph ?? this.#openLazyScope();
		if (within(element, scope.changed)) return;
		if (newElement) {
			scope.changed.add(element);
			this.#safe(() => this.#unmount(element, permanentElements(element)));
		} else this.#safe(() => this.#unmount(element));
	};
	#openLazyScope() {
		const scope = {
			changed: /* @__PURE__ */ new Set(),
			stop: null
		};
		this.#morph = scope;
		queueMicrotask(() => this.#closeScope(scope));
		return scope;
	}
	/**
	* Run a render that morphs: `changed` (stream targets re-mounted whole) is
	* unmounted first, turbo:before-morph-element unmounts what the morph changes or
	* removes while it runs, and once it is done the changed elements and the ones it
	* added are mounted, each once and only the outermost.
	*/
	#morphing(render, changed = []) {
		if (this.#morph) this.#closeScope(this.#morph);
		for (const element of changed) this.#safe(() => this.#unmount(element, permanentElements(element)));
		const scope = {
			changed: new Set(changed),
			stop: observe(this.#getContainer(document))
		};
		this.#morph = scope;
		return afterRender(render, () => this.#closeScope(scope));
	}
	#closeScope(scope) {
		if (this.#morph !== scope) return;
		this.#morph = null;
		const { added, parents } = changes(scope.stop?.() ?? []);
		const mounts = new Set(scope.changed);
		const moved = [];
		for (const node of added) {
			const parent = parents.get(node);
			if (!parent || within(parent, scope.changed)) mounts.add(node);
			else moved.push(node);
		}
		for (const node of moved) if (node.isConnected && inside(node, mounts)) this.#safe(() => this.#unmount(node));
		for (const element of outermost(mounts)) if (element.isConnected) this.#safe(() => this.#mount(element));
	}
	#onBeforeStreamRender = (event) => {
		const detail = event.detail;
		const render = detail.render;
		const permanent = permanentElements(this.#getContainer(document));
		const mounted = permanent.filter((element) => this.#isMounted(element));
		const restore = () => {
			const restored = restorePermanentElements(permanent);
			for (const element of restored) if (mounted.includes(element)) this.#roots.add(element);
			return restored;
		};
		detail.render = async (streamElement) => {
			if (isMorphStream(streamElement)) {
				const targets = streamTargets(streamElement);
				await this.#morphing(async () => {
					await render(streamElement);
					restore();
				}, this.#morphMutations ? targets.filter((target) => replacedByMorph(target, streamElement)) : targets);
				return;
			}
			const stop = observe(this.#getContainer(document));
			await render(streamElement);
			const records = stop();
			this.#reconcile(records, restore());
		};
	};
	#watchPendingStreams() {
		const streams = customElements.get("turbo-stream") ? [...document.querySelectorAll("turbo-stream")] : [];
		const targets = new Set(streams.flatMap(streamTargets));
		if (targets.size === 0) return;
		const stop = observe(this.#getContainer(document), () => {
			if (this.#pendingStreams !== stop || streams.some((stream) => stream.isConnected)) return;
			this.#pendingStreams = null;
			const records = stop().filter((record) => within(record.target, targets) || [...record.removedNodes].some((node) => targets.has(node)));
			this.#reconcile(records, []);
		});
		this.#pendingStreams = stop;
	}
	/**
	* Mount/unmount exactly the nodes a Turbo Stream render touched.
	*
	* POLICY (mount-wins): a morph may report the same reused node as both
	* removed and added — we never unmount-then-remount it, and never
	* double-mount. Each callback is isolated so one throwing listener can't
	* abort the rest of the stream render.
	*/
	#reconcile(records, kept) {
		const { added, parents } = changes(records);
		const ids = new Set(kept.map((element) => element.id));
		for (const [node, parent] of parents) {
			if (!(node instanceof Element) || added.has(node) || node.isConnected) continue;
			for (const copy of permanentElements(node)) if (ids.has(copy.id) && !kept.includes(copy)) copy.remove();
			this.#safe(() => this.#unmount(node, [], this.#isMounted(node) || this.#isMounted(parent)));
		}
		for (const node of outermost(added)) if (node.isConnected) this.#safe(() => this.#mount(node));
	}
	#safe(action) {
		try {
			action();
		} catch (error) {
			console.error(error);
		}
	}
};
export { TurboHandler };

//# sourceMappingURL=index.mjs.map