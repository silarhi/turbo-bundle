# @silarhi/turbo

[![npm version](https://img.shields.io/npm/v/@silarhi/turbo)](https://www.npmjs.com/package/@silarhi/turbo)
![license](https://img.shields.io/npm/l/@silarhi/turbo)

A tiny, framework-agnostic [Hotwire Turbo](https://turbo.hotwired.dev/) lifecycle orchestrator.

`TurboHandler` wires the Turbo **Drive / Frame / Stream** lifecycle to a single pair of
`onMount` / `onUnmount` callbacks, so your per-container listeners (tooltips, selects, datepickers, …)
initialise and clean up correctly across **every** Turbo navigation — including Stream / Mercure
mutations and morphs, which fire no render event of their own.

## Installation

```bash
yarn add @silarhi/turbo
# or: npm install @silarhi/turbo
```

`@hotwired/turbo` is a peer dependency — you already have it in a Turbo app.

## Usage

```ts
import { TurboHandler } from '@silarhi/turbo'

const handler = new TurboHandler({
    onMount: (container) => app.mount(container),
    onUnmount: (container) => app.unmount(container),
})

handler.start() // attach every listener (idempotent)
// handler.stop() // detach them all and reset
```

`onMount` runs on every freshly rendered or inserted container; `onUnmount` runs before one leaves
the DOM. Point them at whatever initialises and tears down your widgets — `TurboHandler` decides
*when* and *on which element*, you decide *what*.

## Options

| Option            | Type                                       | Default            | Purpose                                                                              |
| ----------------- | ------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------ |
| `onMount`         | `(container: Element \| Document) => void` | —                  | Init your listeners on a freshly rendered / inserted element.                        |
| `onUnmount`       | `(container: Element \| Document) => void` | —                  | Tear them down before the element leaves the DOM.                                    |
| `getContainer`    | `(document: Document) => Element`          | `document.body`    | Root element a full Drive render mounts on.                                          |
| `onRedirect`      | `(url: string) => void`                    | `Turbo.visit(url)` | Follow a server `Turbo-Location` redirect.                                           |
| `streamMutations` | `boolean`                                  | `true`             | Diff the DOM around each Turbo Stream render and mount/unmount the nodes it touched. |
| `morphMutations`  | `boolean`                                  | `false`            | Handle Drive/Frame **morph** renders per-node via `turbo:morph-element`.             |

`start()` and `stop()` attach and detach all document listeners and are both idempotent.

## `streamMutations` (Turbo Stream morphs)

By default the handler observes the DOM around every `turbo:before-stream-render`, then mounts the
nodes a Stream inserted and unmounts the ones it removed. It is **morph-aware**: a reused node may be
reported as both removed and added, and the policy is *mount-wins* (never unmount-then-remount, never
double-mount). Pass `streamMutations: false` to opt out and keep stock Turbo behaviour.

## `morphMutations` (Drive & Frame morphs)

`streamMutations` covers Turbo **Stream** morphs (`<turbo-stream method="morph">`). The other two
morph paths — Drive page refresh (`<meta name="turbo-refresh-method" content="morph">`) and frame
refresh (`<turbo-frame refresh="morph">`) — fire `turbo:before-render` / `turbo:before-frame-render`
with `renderMethod: "morph"` and morph the container **in place**. By default the handler treats them
like a replace: it unmounts then re-mounts the whole container, re-initialising listeners even on the
nodes the morph preserved.

Set `morphMutations: true` to instead skip that coarse re-init on morph renders and refresh only the
nodes Turbo actually morphed, via the `turbo:morph-element` event — leaving preserved widgets (an open
select, a focused field) untouched. Scope: it covers elements morphed **in place**; subtrees a morph
adds or removes wholesale aren't re-mounted by this path. It requires `onMount` / `onUnmount` to be
safe to call on an individual element.

## Symfony / PHP companion

The matching PHP package **[`silarhi/turbo-bundle`](https://github.com/silarhi/turbo-bundle)** handles
the server side — it turns a redirect issued inside a Turbo Frame into a `204 + Turbo-Location`
(escalating it to a full Drive visit, the contract `onRedirect` consumes) and ships a `turbo_frame`
Twig filter. The two halves are usable independently.

## License

MIT © [SILARHI](https://silarhi.fr)
