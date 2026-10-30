---
title: Skipping your own refresh broadcast
description: Set the X-Turbo-Request-Id of the request on a broadcast refresh stream, so the tab that made the change does not refresh twice.
sidebar:
    order: 3
---

A Turbo 8 page refresh broadcast (`<turbo-stream action="refresh">`, over Mercure for example) reaches every tab
showing the page, the one that made the change included. That tab already renders the change from its own response:
the refresh reloads it a second time.

Turbo sends an `X-Turbo-Request-Id` header with each of its fetch requests and remembers the last ones. When a
`refresh` stream carries one of them as its `request-id`, the tab that sent the request skips it. `TurboManager` reads
that header, so the broadcast can carry it:

```php
use Silarhi\TurboBundle\TurboManager;
use Symfony\Component\Mercure\HubInterface;
use Symfony\Component\Mercure\Update;
use Symfony\UX\Turbo\Helper\TurboStream;

public function edit(Request $request, Project $item, HubInterface $hub, TurboManager $turbo): Response
{
    // …
    $hub->publish(new Update('projects', TurboStream::refresh($turbo->getTurboRequestId())));

    return $this->redirectToRoute('projects_show', ['id' => $item->getId()]);
}
```

In a template rendered for the broadcast, use the `turbo_request_id()` Twig function:

```twig
<turbo-stream action="refresh" request-id="{{ turbo_request_id() }}"></turbo-stream>
```

`getTurboRequestId()` and `turbo_request_id()` return `null` when the header is missing: on Turbo 7, which sends none,
on a request Turbo did not send, and without a current request. A `refresh` stream without a `request-id` (or with an
empty one) refreshes every tab.

:::caution
A message handler or a console command has no current request. When the broadcast is sent from an async Messenger
handler, read the id in the controller and carry it in the message.
:::

Not to be confused with `turbo_frame_request_id()` of `symfony/ux-turbo`, which returns the id of the requesting
**frame** (the `Turbo-Frame` header), like [`turbo_frame_id()`](/php/turbo-frame-filter/).
