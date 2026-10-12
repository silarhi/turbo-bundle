---
title: Frame response without a matching frame
description: Render a frame response that has no matching turbo-frame as a full page with visitOnFrameMissing.
sidebar:
    order: 4
---

When a frame request gets a response that has no matching `<turbo-frame>` (typically an expired session redirecting
to a login page), Turbo fires `turbo:frame-missing`, writes "Content missing" into the frame and throws. Set
`visitOnFrameMissing: true` to cancel that and render the response as a full page instead:

```ts
new TurboHandler({
    onMount: (container) => app.mount(container),
    onUnmount: (container) => app.unmount(container),
    visitOnFrameMissing: true,
})
```

The response already received is rendered: there is no second request. The option is off by default (stock Turbo
behavior) and requires Turbo 7.2+, where `turbo:frame-missing` was introduced.

It does the same as:

```js
document.addEventListener('turbo:frame-missing', (event) => {
    event.preventDefault()
    event.detail.visit(event.detail.response)
})
```
