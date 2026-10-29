---
title: Morph mutations
description: Refresh only the elements a Drive or Frame morph changed, instead of re-initializing the whole container.
sidebar:
    order: 3
---

[`streamMutations`](/javascript/stream-mutations/) covers Turbo **Stream** morphs (`<turbo-stream method="morph">`).
The other two morph paths, both from Turbo 8, are:

- the Drive page refresh: `<meta name="turbo-refresh-method" content="morph">`,
- the frame refresh: `<turbo-frame refresh="morph">`.

They fire `turbo:before-render` / `turbo:before-frame-render` with `renderMethod: "morph"` and morph the container
**in place**. By default the handler treats them like a replace: it unmounts then re-mounts the whole container,
re-initializing listeners even on the nodes the morph preserved.

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

| Render                     | Behavior                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| Drive morph                | No `onUnmount` / `onMount` of the container, before or after the render.                           |
| Frame morph                | No `onUnmount` / `onMount` of the frame, before the render or on `turbo:frame-load`.               |
| Each element changed       | `onUnmount(element)` then `onMount(element)`; an exception is logged and does not stop the others. |
| Replace (non-morph) render | Unchanged: the whole container or frame is unmounted, then mounted.                                |

Turbo fires `turbo:morph-element` for every element the morph matched, the unchanged ones and their ancestors up to
`<body>` included. The handler compares each element with its new markup on `turbo:before-morph-element`, and only
re-mounts it when the element **itself** changes: an attribute, or one of its own child nodes (a text, a comment, or
an element replaced by another tag or added or removed). A change deeper down counts for that descendant only, so the
ancestors of a changed element keep their listeners. What your listeners added to an element (a badge, a class) is in
its DOM but not in the new markup: the morph removes it, so that element counts as changed and is re-mounted.

## Scope

- It covers elements morphed **in place**. Subtrees a morph adds or removes wholesale aren't re-mounted by this path.
- It requires `onMount` / `onUnmount` to be safe to call on an individual element.
- Without the option, `turbo:morph-element` is ignored.
