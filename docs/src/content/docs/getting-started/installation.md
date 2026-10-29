---
title: Installation
description: Install the PHP bundle and the @silarhi/turbo npm package, and register the bundle.
sidebar:
    order: 1
---

The repository ships two packages, released from the same git tag. Install one, the other, or both.

| Package                | Registry                                                         | What it does                                                                                    |
| ---------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `@silarhi/turbo`       | [npm](https://www.npmjs.com/package/@silarhi/turbo)              | `TurboHandler`: runs your mount/unmount callbacks across every Turbo render, follows redirects. |
| `silarhi/turbo-bundle` | [Packagist](https://packagist.org/packages/silarhi/turbo-bundle) | Frame-redirect following and the `turbo_frame` Twig filter.                                     |

## Requirements

| Dependency                                                                                               | Version         |
| -------------------------------------------------------------------------------------------------------- | --------------- |
| PHP                                                                                                      | 8.2+            |
| Symfony components (event-dispatcher, http-foundation, http-kernel)                                      | 6.4 / 7.x / 8.x |
| [`@hotwired/turbo`](https://www.npmjs.com/package/@hotwired/turbo) (peer dependency of `@silarhi/turbo`) | 7.2+ / 8.x      |

Morph renders, and so [`morphMutations`](/javascript/morph-mutations/), exist since Turbo 8. Turbo 7.1 lacks the
events the handler relies on to unmount a frame and to mount what a stream inserts (`turbo:before-frame-render`, the
`render` hook of `turbo:before-stream-render`), added in 7.2.

### Optional dependencies

| Package                    | Required for                                                    |
| -------------------------- | --------------------------------------------------------------- |
| `symfony/framework-bundle` | Registering `SilarhiTurboBundle` for zero-config service wiring |
| `twig/twig`                | The `turbo_frame` Twig filter                                   |

`symfony/config` and `symfony/dependency-injection` are not installed with the package: only `SilarhiTurboBundle`
uses them, and a Symfony application already has them through `symfony/framework-bundle`.

## JavaScript half

```bash
pnpm add @silarhi/turbo
```

With [AssetMapper](https://symfony.com/doc/current/frontend/asset_mapper.html), add it to the import map instead:

```bash
php bin/console importmap:require @silarhi/turbo
```

`@hotwired/turbo` is a peer dependency: a Turbo application already has it. The package does not import it, so the
import map gets a single entry. The package is an ES module with its TypeScript declarations. Continue with [TurboHandler](/javascript/turbo-handler/).

## PHP half

```bash
composer require silarhi/turbo-bundle
```

### Full Symfony application

Register the optional bundle for zero-config service wiring:

```php
// config/bundles.php
return [
    // ...
    Silarhi\TurboBundle\SilarhiTurboBundle::class => ['all' => true],
];
```

`TurboManager` and `TurboFrameListener` are now registered (the listener is tagged `kernel.event_subscriber`
automatically), plus the `turbo_frame` Twig filter when Twig is installed. Every option has a default: see the
[configuration reference](/reference/configuration/) to change them.

### Without the framework

The bundle class is optional. The services depend on HttpFoundation, HttpKernel and EventDispatcher only, not on the
dependency injection container, so a project that wires its event dispatcher by hand can instantiate them itself: see
[Without the framework](/php/without-framework/).
