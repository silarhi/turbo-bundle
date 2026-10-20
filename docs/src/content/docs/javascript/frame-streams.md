---
title: Streams in a frame response
description: Update the page around a frame from its response with frameStreams.
sidebar:
    order: 6
---

A frame request only swaps its own `<turbo-frame>`: Turbo discards the rest of the response, including any
`<turbo-stream>` element living outside the frame. Set `frameStreams: true` to run those streams after the frame
rendered, so the server can update the page around a frame with the same markup as a Turbo Stream response:

```ts
new TurboHandler({
    onMount: (container) => app.mount(container),
    onUnmount: (container) => app.unmount(container),
    frameStreams: true,
})
```

The typical use is the flash messages of a frame request. The lean frame layout renders them as a stream next to the
page content, the same markup a Turbo Stream response uses:

```twig
{# base-frame.html.twig: the layout of a frame request (the `turbo_frame` filter) #}
<turbo-stream action="append" target="flash-alerts">
    <template>{# the flash messages #}</template>
</turbo-stream>
{% block body %}{% endblock %}
```

Only the streams outside **any** `<turbo-frame>` run: a stream inside the rendered frame came in with it and Turbo ran
it on insertion; one inside another frame belongs to content that was not rendered. The response already received is
read again: there is no second request. With [`streamMutations`](/javascript/stream-mutations/) (on by default), the
nodes the streams insert are mounted like any other stream render.

It does the same as:

```js
document.addEventListener('turbo:frame-render', async (event) => {
    const html = await event.detail.fetchResponse.responseHTML
    const response = new DOMParser().parseFromString(html, 'text/html')
    for (const stream of response.querySelectorAll('turbo-stream')) {
        if (!stream.closest('turbo-frame')) {
            document.body.append(document.importNode(stream, true))
        }
    }
})
```
