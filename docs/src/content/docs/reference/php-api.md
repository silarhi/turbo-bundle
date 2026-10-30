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

| Method                             | Returns                                                                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hasTurboFrame(): bool`            | Whether the request has a `Turbo-Frame` header.                                                                                                                            |
| `getTurboFrameId(): ?string`       | The `Turbo-Frame` header: the id of the requesting frame, or `null`.                                                                                                       |
| `followTurboFrameRedirect(): bool` | Whether a redirect should be escalated: a `Turbo-Frame` header and no `Turbo-Frame-Follow-Redirect` header.                                                                |
| `isTurboRequest(): bool`           | Whether Turbo sent the request: an `X-Turbo-Request-Id` header (Turbo 8), or an `Accept` header with `text/vnd.turbo-stream.html` (the form submissions of Turbo 7 and 8). |
| `getTurboRequestId(): ?string`     | The `X-Turbo-Request-Id` header (Turbo 8), or `null`: the `request-id` of a [broadcast `refresh` stream](/php/request-id/).                                                |

Without a current request on the stack (a console command, a message handler, an email rendered outside a request),
every method answers as for a plain request: `false`, or `null` for `getTurboFrameId()` and `getTurboRequestId()`.

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

| Method                                         | Effect                                                                                                                                                                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getSubscribedEvents(): array` (static)        | `kernel.response` → `onKernelResponse`, default priority.                                                                                                                                                                                                |
| `onKernelResponse(ResponseEvent $event): void` | Replaces a redirect with a `204 + Turbo-Location`, keeping its other headers and cookies ([rules](/php/frame-redirects/#when-a-redirect-is-converted)), or turns it into a `303` ([rules](/php/frame-redirects/#303-see-other-for-the-other-redirects)). |

## `TurboExtension`

`Silarhi\TurboBundle\Twig\TurboExtension` is a classic Twig `AbstractExtension` (not the `#[AsTwigFilter]` attribute),
so it works on Symfony 6.4 and 7.0 to 7.2, where attribute-based Twig extensions are not auto-registered.

```php
public function __construct(TurboManager $turboManager, string $baseTemplate = 'base-frame.html.twig')
```

| Method                                                                                                                  | Effect                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getFilters(): array`                                                                                                   | The `turbo_frame` filter.                                                                                                                                              |
| `getFunctions(): array`                                                                                                 | The `turbo_frame_request`, `turbo_frame_id` and `turbo_request_id` functions.                                                                                          |
| `isTurboFrameRequest(?string $frameId = null): bool`                                                                    | Whether the request targets a Turbo Frame, any or the given one ([functions](/php/turbo-frame-filter/#branching-on-the-frame-turbo_frame_request-and-turbo_frame_id)). |
| `turboFrameId(): ?string`                                                                                               | The id of the requesting frame, or `null`.                                                                                                                             |
| `turboRequestId(): ?string`                                                                                             | The `X-Turbo-Request-Id` of the request, or `null` ([request id](/php/request-id/)).                                                                                   |
| `turboFrame(Environment $environment, string $template, ?string $frameId = null, ?string $baseTemplate = null): string` | The template to extend ([resolution](/php/turbo-frame-filter/#resolution)).                                                                                            |

## `TurboAssertionsTrait`

`Silarhi\TurboBundle\Test\TurboAssertionsTrait` is a trait for PHPUnit tests ([Testing](/php/testing/)). Every method
is `public static`.

| Method                                                                                                      | Effect                                                                                                     |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `getTurboFrameHeaders(string $frameId): array`                                                              | The `$server` parameters of a frame request: `Turbo-Frame` and a new `X-Turbo-Request-Id`.                 |
| `getTurboStreamHeaders(): array`                                                                            | The `$server` parameters of a Turbo 8 form submission: the stream `Accept` and a new `X-Turbo-Request-Id`. |
| `assertTurboStreamResponse(Response $response, string $message = ''): void`                                 | Asserts a `text/vnd.turbo-stream.html` content type.                                                       |
| `assertTurboStream(Response $response, string $action, ?string $target = null, string $message = ''): void` | Asserts a `<turbo-stream>` with this action, and this `target` or `targets` when given.                    |
| `assertTurboLocation(Response $response, string $expectedUrl, string $message = ''): void`                  | Asserts a `204` with this `Turbo-Location`.                                                                |

## `SilarhiTurboBundle`

`Silarhi\TurboBundle\SilarhiTurboBundle` is the optional bundle: it defines the
[configuration](/reference/configuration/) and registers the three services above.
