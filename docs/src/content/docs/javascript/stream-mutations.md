---
title: Stream mutations
description: How TurboHandler mounts and unmounts the nodes a Turbo Stream inserts or removes, and how to turn it off.
sidebar:
    order: 2
---

Turbo Streams, including those received from Mercure through `<turbo-stream-source>`, change the DOM without any render
lifecycle event: listeners never initialize on the inserted content, and cleanups never run for the removed content.
The `streamMutations` option, on by default, fixes that.

## How it works

On every `turbo:before-stream-render`, the handler wraps the stream's render function. While the stream renders, a
`MutationObserver` records the child list changes under the [render container](/javascript/turbo-handler/#the-render-container)
(`document.body` by default). Once rendered:

1. each removed element is passed to `onUnmount`,
2. each inserted element is passed to `onMount`.

Only elements are reported, not text nodes, and only the root of each inserted or removed subtree: an `append` of a
`<li>` calls `onMount` with that `<li>`, not with each of its children.

## Morph-aware

A render may report the same reused node as both removed and added. The policy is **mount-wins**: such a node is only
mounted, never unmounted then remounted, and never mounted twice.

A stream with `method="morph"` (`replace` or `update`) changes its targets in place, which the child list alone doesn't
show. Each target is unmounted before the render and mounted after, like a frame; what the morph adds outside the
targets (a target it replaced) is mounted. With [`morphMutations`](/javascript/morph-mutations/), only the elements the
morph changes, removes or adds are.

## Permanent elements

A stream whose content has an element with the `id` of a `data-turbo-permanent` element of the page keeps that element:
Turbo inserts a copy of it and takes the element itself out of the page. The handler puts the element back in place of
the copy, its widgets still mounted, and leaves it out of the `onUnmount` / `onMount` of the nodes around it.

## Streams in the page

A `<turbo-stream>` in the HTML of the page renders as soon as Turbo is imported, before an app that imports Turbo first
starts the handler. When the handler starts, it watches the targets of the streams already in the page until they are
done, and mounts what they inserted.

## Error isolation

Each callback runs on its own: an exception in one `onMount` or `onUnmount` is logged with `console.error`, and the
other nodes of the same stream render are still processed.

## Turning it off

```ts
new TurboHandler({
    onMount: (container) => app.mount(container),
    onUnmount: (container) => app.unmount(container),
    streamMutations: false,
})
```

The handler then does not listen to `turbo:before-stream-render` at all: stream renders keep the stock Turbo
behavior, with no per-node lifecycle.

:::note
Streams whose target is outside the render container (in the `<head>`, or outside a custom `getContainer` element)
are not observed.
:::
