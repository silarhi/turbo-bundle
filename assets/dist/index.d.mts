interface TurboHandlerOptions {
  /**
   * Mount your per-container listeners on a freshly rendered/inserted element:
   * the `getContainer` element, a `<turbo-frame>`, or a node a Stream inserted.
   * A wider `(container: Element | Document) => void` function fits too.
   */
  onMount: (container: Element) => void;
  /** Tear down the listeners previously mounted on a container before it leaves the DOM. */
  onUnmount: (container: Element) => void;
  /**
   * Resolve the root element a full Turbo Drive render mounts on.
   * Defaults to `document.body`.
   */
  getContainer?: (document: Document) => Element;
  /**
   * Follow a server-issued `Turbo-Location` redirect (pairs with the PHP
   * `TurboFrameListener`). Defaults to `window.Turbo.visit(url)`, or to a full
   * page load (`window.location.assign(url)`, with a console warning) when the
   * `Turbo` global is missing.
   */
  onRedirect?: (url: string) => void;
  /**
   * Diff the DOM around every Turbo Stream render and mount/unmount the nodes
   * it touched, so per-mount listeners initialize on stream/Mercure-inserted
   * content. Morph-aware. Defaults to `true`; pass `false` for stock Turbo
   * behavior (no per-node lifecycle on stream renders).
   */
  streamMutations?: boolean;
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
  morphMutations?: boolean;
  /**
   * When a frame response has no matching `<turbo-frame>` (`turbo:frame-missing`),
   * cancel Turbo's default handling (an error message written into the frame
   * plus a thrown exception) and render the response as a full Drive visit
   * instead. Defaults to `false` (stock Turbo behavior). Requires Turbo 7.2+.
   */
  visitOnFrameMissing?: boolean;
  /**
   * Run the `<turbo-stream>` elements a frame response carries **outside** any
   * `<turbo-frame>`, which Turbo otherwise discards with the rest of the page
   * (`turbo:frame-render`). Lets the server answer a frame request
   * and update the page around it — typically the layout appending the flash
   * messages to a page-level container — with the same stream markup as a
   * Turbo Stream response. Defaults to `false` (stock Turbo behavior).
   */
  frameStreams?: boolean;
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
export declare class TurboHandler {
  #private;
  constructor(options: TurboHandlerOptions);
  /** Attach every document listener. Idempotent — calling twice is a no-op. */
  start(): void;
  /** Detach every document listener and reset to a pre-boot state. Idempotent. */
  stop(): void;
}
export type { TurboHandlerOptions };