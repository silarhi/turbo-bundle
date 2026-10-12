---
title: TurboHandler options
description: The constructor options and methods of TurboHandler, from @silarhi/turbo.
sidebar:
    order: 2
---

```ts
import { TurboHandler, type TurboHandlerOptions } from '@silarhi/turbo'
```

The package exports the `TurboHandler` class and the `TurboHandlerOptions` type.

## Options

| Option                | Type                                       | Default            | Purpose                                                                                                                 |
| --------------------- | ------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `onMount`             | `(container: Element \| Document) => void` | (required)         | Init your listeners on a freshly rendered / inserted element.                                                           |
| `onUnmount`           | `(container: Element \| Document) => void` | (required)         | Tear them down before the element leaves the DOM.                                                                       |
| `getContainer`        | `(document: Document) => Element`          | `document.body`    | Root element a full Drive render mounts on.                                                                             |
| `onRedirect`          | `(url: string) => void`                    | `Turbo.visit(url)` | Follow a server `Turbo-Location` redirect.                                                                              |
| `streamMutations`     | `boolean`                                  | `true`             | Diff the DOM around each Turbo Stream render and mount/unmount the nodes it touched.                                    |
| `morphMutations`      | `boolean`                                  | `false`            | Handle Drive/Frame **morph** renders per-node via `turbo:morph-element` instead of re-initializing the whole container. |
| `visitOnFrameMissing` | `boolean`                                  | `false`            | Render a frame response with no matching `<turbo-frame>` as a full Drive visit (Turbo 7.2+).                            |

Guides: [TurboHandler](/javascript/turbo-handler/), [`streamMutations`](/javascript/stream-mutations/),
[`morphMutations`](/javascript/morph-mutations/), [`visitOnFrameMissing`](/javascript/frame-missing/).

## Methods

| Method    | Effect                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------- |
| `start()` | Attach every `document` listener. Idempotent: calling it twice is a no-op.                              |
| `stop()`  | Detach every listener and reset to a pre-boot state, so the next `turbo:load` mounts again. Idempotent. |

The options are read once, by the constructor: create a new handler to change them.
