---
title: TurboHandler
description: Run one pair of mount and unmount callbacks across Turbo Drive, Frame and Stream renders.
sidebar:
    order: 1
---

`TurboHandler` wires the Turbo Drive / Frame / Stream lifecycle to a single pair of `onMount` / `onUnmount`
callbacks, so your per-container listeners (tooltips, selects, date pickers…) initialize and clean up correctly across
every Turbo navigation, including Stream and Mercure mutations, which fire no render event of their own.

```ts
import { TurboHandler } from '@silarhi/turbo'

const handler = new TurboHandler({
    onMount: (container) => app.mount(container),
    onUnmount: (container) => app.unmount(container),
})

handler.start() // attach listeners (idempotent)
// handler.stop() // detach them all and reset
```

`onMount` runs on every freshly rendered or inserted container; `onUnmount` runs before one leaves the DOM. Point them
at whatever initializes and tears down your widgets: `TurboHandler` decides _when_ and _on which element_, you decide
_what_.

## Writing the callbacks

- The callbacks are typed `(container: Element) => void`: the handler always passes an element. A function typed
  `(container: Element | Document) => void`, such as an existing `mount(root = document)`, fits too.
- The container can be the `<body>`, a `<turbo-frame>`, or a single node a Stream inserted. Look for your widgets
  _inside_ the container **and on the container itself**: a Stream that appends `<select data-choices>` passes the
  `<select>`.
- [`morphMutations`](/javascript/morph-mutations/) calls them on individual elements, and may call `onUnmount` then
  `onMount` on the same element: make them safe to call on any element, and idempotent.

## When the callbacks run

| Turbo event                                                                           | Call                                                                                                       |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| First `turbo:load`                                                                    | `onMount(container)`                                                                                       |
| `turbo:before-render` (Drive visit)                                                   | `onUnmount(container)`                                                                                     |
| `turbo:render` followed by `turbo:load`                                               | `onMount(container)`                                                                                       |
| `turbo:load` without a render (a frame navigation with `data-turbo-action="advance"`) | nothing: the body did not change                                                                           |
| `turbo:render` after a failed form submission outside any frame                       | `onMount(container)`: Turbo renders the response (a `422` form) but fires no `turbo:load`                  |
| `turbo:before-frame-render`                                                           | `onUnmount(frame)`                                                                                         |
| `turbo:frame-load`                                                                    | `onMount(frame)`                                                                                           |
| `turbo:before-stream-render`                                                          | `onUnmount` / `onMount` on each removed / inserted node: [Stream mutations](/javascript/stream-mutations/) |
| `turbo:morph-element` (opt-in)                                                        | `onUnmount(element)` then `onMount(element)`: [Morph mutations](/javascript/morph-mutations/)              |

`container` is the element returned by `getContainer`, `document.body` by default. The handler also listens to:

- `turbo:before-fetch-request`, to add the `Turbo-Frame-Follow-Redirect` header to the requests of frames carrying
  `data-turbo-follow-redirect` ([Keeping a redirect in its frame](/javascript/follow-redirect/)),
- `turbo:before-fetch-response`, to follow a `Turbo-Location` header ([Frame redirects](/php/frame-redirects/)),
- `turbo:frame-missing`, when [`visitOnFrameMissing`](/javascript/frame-missing/) is on,
- `turbo:frame-render`, when [`frameStreams`](/javascript/frame-streams/) is on.

:::caution[Start before the first page load]
The first mount happens on the first `turbo:load`. Call `start()` when your entry point runs, not after a delay: a
handler started after that event never mounts the first page.
:::

## Starting and stopping

- `start()` attaches every listener to `document`. Calling it again is a no-op.
- `stop()` detaches them all and resets the handler to its pre-boot state: after a new `start()`, the next
  `turbo:load` counts as the first one and mounts the container. Calling it on a stopped handler is a no-op.

## The render container

`getContainer` returns the element a full Drive render mounts on and unmounts from, and the root
[Stream mutations](/javascript/stream-mutations/) are observed under. It receives the `document`:

```ts
new TurboHandler({
    onMount: (container) => app.mount(container),
    onUnmount: (container) => app.unmount(container),
    getContainer: (document) => document.getElementById('app') ?? document.body,
})
```

## Following redirects

When a response carries a `Turbo-Location` header, the handler cancels Turbo's handling of the response and calls
`onRedirect` with its value. The default visits it with `window.Turbo.visit(url)`, the global `@hotwired/turbo` sets
when imported. Without that global, it falls back to a full page load (`window.location.assign(url)`) and logs a
warning, so the redirect is never lost. Pass your own function to log the redirect, or to visit with options:

```ts
import * as Turbo from '@hotwired/turbo'

new TurboHandler({
    onMount: (container) => app.mount(container),
    onUnmount: (container) => app.unmount(container),
    onRedirect: (url) => Turbo.visit(url, { action: 'replace' }),
})
```

The header comes from the PHP [`TurboFrameListener`](/php/frame-redirects/), or from any backend that sends it.

## Options

Every option is described in the [options reference](/reference/turbo-handler/). Three of them change how renders are
handled:

- [`streamMutations`](/javascript/stream-mutations/), on by default: per-node lifecycle for Turbo Streams.
- [`morphMutations`](/javascript/morph-mutations/), off by default: per-element refresh for Drive and Frame morphs.
- [`visitOnFrameMissing`](/javascript/frame-missing/), off by default: render a frame response without a matching frame
  as a full page.
- [`frameStreams`](/javascript/frame-streams/), off by default: run the streams a frame response carries outside its
  frames.
