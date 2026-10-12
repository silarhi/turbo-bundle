---
title: Without the framework
description: Use TurboManager, TurboFrameListener and the Twig extension with Symfony components only.
sidebar:
    order: 3
---

The PHP half depends on Symfony components only, not on `symfony/framework-bundle`: it works in projects that wire an
event dispatcher by hand. Skip `SilarhiTurboBundle` and instantiate the classes:

```php
use Silarhi\TurboBundle\EventListener\TurboFrameListener;
use Silarhi\TurboBundle\TurboManager;
use Silarhi\TurboBundle\Twig\TurboExtension;

$turboManager = new TurboManager($requestStack);
$dispatcher->addSubscriber(new TurboFrameListener($turboManager));

// Optional: the turbo_frame Twig filter (requires twig/twig).
// The second argument is the base template the filter falls back to (default: 'base-frame.html.twig').
$twig->addExtension(new TurboExtension($turboManager, 'base-frame.html.twig'));
```

`TurboFrameListener` also follows `DELETE` redirects on Turbo requests by default; pass
`new TurboFrameListener($turboManager, followDeleteRedirects: false)` to disable that.

## Requirements

- `$requestStack` must be the `RequestStack` your `HttpKernel` pushes requests on: `TurboManager` reads the headers of
  its current request, and throws a `RuntimeException` ("No request available") when there is none.
- `$dispatcher` must be the event dispatcher of that `HttpKernel`: the listener subscribes to `kernel.response`.
- The Twig filter is used while rendering a request: outside of one (a console command, a message handler),
  `turbo_frame` throws the same exception.

See the [PHP API reference](/reference/php-api/) for every public method.
