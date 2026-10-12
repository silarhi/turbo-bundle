---
title: PHP API
description: The public classes and methods of silarhi/turbo-bundle.
sidebar:
    order: 3
---

## `TurboManager`

`Silarhi\TurboBundle\TurboManager` reads the Turbo request headers off the current request of a `RequestStack`.

```php
public function __construct(RequestStack $requestStack)
```

| Method                             | Returns                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `hasTurboFrame(): bool`            | Whether the request has a `Turbo-Frame` header.                                                             |
| `getTurboFrameId(): ?string`       | The `Turbo-Frame` header: the id of the requesting frame, or `null`.                                        |
| `followTurboFrameRedirect(): bool` | Whether a redirect should be escalated: a `Turbo-Frame` header and no `Turbo-Frame-Follow-Redirect` header. |
| `isTurboRequest(): bool`           | Whether the request has an `X-Turbo-Request-Id` header, which Turbo sends with its fetch requests.          |

Every method throws a `RuntimeException` ("No request available") when the stack has no current request.

Inject it in a controller to branch on frame requests yourself:

```php
public function show(Project $project, TurboManager $turbo): Response
{
    if ('project-details' === $turbo->getTurboFrameId()) {
        return $this->render('project/_details.html.twig', ['project' => $project]);
    }

    return $this->render('project/show.html.twig', ['project' => $project]);
}
```

## `TurboFrameListener`

`Silarhi\TurboBundle\EventListener\TurboFrameListener` implements `EventSubscriberInterface` only, so it can be added
to any Symfony event dispatcher.

```php
public function __construct(TurboManager $turboManager, bool $followDeleteRedirects = true)
```

| Method                                         | Effect                                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `getSubscribedEvents(): array` (static)        | `kernel.response` → `onKernelResponse`, default priority.                                                        |
| `onKernelResponse(ResponseEvent $event): void` | Replaces a redirect with a `204 + Turbo-Location` ([rules](/php/frame-redirects/#when-a-redirect-is-converted)). |

## `TurboExtension`

`Silarhi\TurboBundle\Twig\TurboExtension` is a classic Twig `AbstractExtension` (not the `#[AsTwigFilter]` attribute),
so it works on Symfony 6.4 and 7.0 to 7.2, where attribute-based Twig extensions are not auto-registered.

```php
public function __construct(TurboManager $turboManager, string $baseTemplate = 'base-frame.html.twig')
```

| Method                                                                                                                  | Effect                                                                      |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `getFilters(): array`                                                                                                   | The `turbo_frame` filter.                                                   |
| `turboFrame(Environment $environment, string $template, ?string $frameId = null, ?string $baseTemplate = null): string` | The template to extend ([resolution](/php/turbo-frame-filter/#resolution)). |

## `SilarhiTurboBundle`

`Silarhi\TurboBundle\SilarhiTurboBundle` is the optional bundle: it defines the
[configuration](/reference/configuration/) and registers the three services above.
