---
title: Without the framework
description: Use TurboManager, the listeners, TurboStreamCollector and the Twig extension with Symfony components only.
sidebar:
    order: 7
---

The PHP half depends on three Symfony components only, `symfony/http-foundation`, `symfony/http-kernel` and
`symfony/event-dispatcher`: neither `symfony/framework-bundle` nor `symfony/dependency-injection` is installed with it.
It works in projects that wire an event dispatcher by hand. Skip `SilarhiTurboBundle` (it is the only class that needs
the container) and instantiate the classes:

```php
use Silarhi\TurboBundle\EventListener\TurboFrameListener;
use Silarhi\TurboBundle\EventListener\TurboStreamListener;
use Silarhi\TurboBundle\TurboManager;
use Silarhi\TurboBundle\TurboStreamBuilder;
use Silarhi\TurboBundle\TurboStreamCollector;
use Silarhi\TurboBundle\TurboStreamRenderer;
use Silarhi\TurboBundle\Twig\TurboExtension;

$turboManager = new TurboManager($requestStack);
$dispatcher->addSubscriber(new TurboFrameListener($turboManager));

// Optional: streams collected during the request, appended to its Turbo Stream response
$turboStreamBuilder = new TurboStreamBuilder();
$turboStreams = new TurboStreamCollector($requestStack, $turboStreamBuilder);
$dispatcher->addSubscriber(new TurboStreamListener($turboStreams));

// Optional: the turbo_frame Twig filter (requires twig/twig).
// The second argument is the base template the filter falls back to (default: 'base-frame.html.twig'),
// the third the builder of the turbo_stream helpers (default: a new TurboStreamBuilder).
$twig->addExtension(new TurboExtension($turboManager, 'base-frame.html.twig', $turboStreamBuilder));

// Optional: render a template or one of its blocks as a Turbo Stream response (requires twig/twig).
$turboStreamRenderer = new TurboStreamRenderer($twig);
```

`TurboFrameListener` also follows `DELETE` redirects on Turbo requests by default; pass
`new TurboFrameListener($turboManager, followDeleteRedirects: false)` to disable that.

## Requirements

- `$requestStack` must be the `RequestStack` your `HttpKernel` pushes requests on: `TurboManager` reads the headers of
  its current request, and answers as for a plain, non-Turbo request when there is none.
- `$dispatcher` must be the event dispatcher of that `HttpKernel`: the listener subscribes to `kernel.response`.
- Outside a request (a console command, a message handler, an email), the `turbo_frame` filter returns the template
  unchanged.

See the [PHP API reference](/reference/php-api/) for every public method.
