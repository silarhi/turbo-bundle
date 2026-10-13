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
| Symfony components (config, dependency-injection, event-dispatcher, http-foundation, http-kernel)        | 6.4 / 7.x / 8.x |
| [`@hotwired/turbo`](https://www.npmjs.com/package/@hotwired/turbo) (peer dependency of `@silarhi/turbo`) | 7.1+ / 8.x      |

`visitOnFrameMissing` needs Turbo 7.2+, and morph renders exist since Turbo 8. Following `DELETE` redirects outside a
frame also needs Turbo 8: the bundle recognizes these requests by the `X-Turbo-Request-Id` header, which Turbo 7 does
not send ([`DELETE` redirects](/php/frame-redirects/#delete-redirects)).

### Optional dependencies

| Package                    | Required for                                                    |
| -------------------------- | --------------------------------------------------------------- |
| `symfony/framework-bundle` | Registering `SilarhiTurboBundle` for zero-config service wiring |
| `twig/twig`                | The `turbo_frame` Twig filter                                   |

## JavaScript half

```bash
yarn add @silarhi/turbo
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

The bundle class is optional. The services depend on Symfony components only, so a project that wires its event
dispatcher by hand can instantiate them itself: see [Without the framework](/php/without-framework/).
