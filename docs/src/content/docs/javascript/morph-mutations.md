---
title: Morph mutations
description: Refresh only the elements a Turbo 8 morph changed, instead of re-initializing the whole container.
sidebar:
    order: 3
---

Turbo 8 morphs in three places:

- the Drive page refresh: `<meta name="turbo-refresh-method" content="morph">`,
- the frame refresh: `<turbo-frame refresh="morph">`,
- the streams with `method="morph"`: `<turbo-stream action="replace" method="morph">`, and `action="update"`.

A morph changes the DOM **in place**. By default the handler treats it like a replace: it unmounts the whole container
(the `<body>`, the frame, or each target of the stream) before the morph, and mounts it after, re-initializing
listeners even on the nodes the morph preserved.

## Per-element refresh

Set `morphMutations: true` to instead skip that coarse re-init on morph renders and refresh only the elements the
morph changed, leaving preserved widgets (an open select, a focused field) untouched:

```ts
new TurboHandler({
    onMount: (container) => app.mount(container),
    onUnmount: (container) => app.unmount(container),
    morphMutations: true,
})
```

With the option on:

| Render                         | Behavior                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| Drive, frame or stream morph   | No `onUnmount` / `onMount` of the container, the frame or the stream targets.                      |
| Each element the morph changes | `onUnmount(element)` before the morph touches it, `onMount(element)` once the whole morph is done. |
| Each element the morph removes | `onUnmount(element)` before the morph removes it.                                                  |
| Each element the morph adds    | `onMount(element)` once the whole morph is done.                                                   |
| Replace (non-morph) render     | Unchanged: the whole container or frame is unmounted, then mounted.                                |

Each element is mounted once, and only the outermost: an element inside one that is mounted again is left to it. An
exception in a callback is logged and does not stop the others.

Turbo fires `turbo:before-morph-element` for every element the morph matched, the unchanged ones and their ancestors
up to `<body>` included. The handler compares each element with its new markup, and only re-mounts it when the element
**itself** changes: an attribute, or one of its own child nodes (a text, a comment, or an element replaced by another
tag or added or removed). A change deeper down counts for that descendant only, so the ancestors of a changed element
keep their listeners. What your listeners added to an element (a badge, a class, the markup of a Tom Select) is in its
DOM but not in the new markup: that element counts as changed and is re-mounted.

### Why unmount before, and mount after

A widget that cleans up after the morph cleans up into the new markup: Tom Select's `destroy()` puts back the
`<option>` elements it found at init, which brings back the old selected value. A widget mounted during the morph
inserts its markup next to nodes the morph has not reached yet, and the morph then removes it. So the handler unmounts
each element before the morph touches it, and mounts once the whole morph is done.

### Frame morphs

Turbo 8 reports a frame morph as `renderMethod: "replace"` on `turbo:before-frame-render`: its `MorphingFrameRenderer`
doesn't override the render method. The handler tells a morph from its render function instead, which it compares with
the one of `Turbo.FrameRenderer` on a frame with `refresh="morph"`.

## Scope

- It requires `onMount` / `onUnmount` to be safe to call on an individual element.
- It needs [`streamMutations`](/javascript/stream-mutations/) (on by default) to mount what a stream morph adds. With
  `streamMutations: false`, the elements a stream morph changes are still re-mounted, on the next microtask.
- Elements with `data-turbo-permanent` are not morphed: their listeners are left alone.
