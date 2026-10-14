<p align="center">
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/packagist/v/silarhi/turbo-bundle?style=for-the-badge&label=stable&color=0d6efd&labelColor=1a1a2e">
        <img src="https://img.shields.io/packagist/v/silarhi/turbo-bundle?style=for-the-badge&label=stable&color=0d6efd"
            alt="Latest Stable Version">
    </picture>
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/packagist/dt/silarhi/turbo-bundle?style=for-the-badge&color=198754&labelColor=1a1a2e">
        <img src="https://img.shields.io/packagist/dt/silarhi/turbo-bundle?style=for-the-badge&color=198754" alt="Total Downloads">
    </picture>
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/packagist/l/silarhi/turbo-bundle?style=for-the-badge&color=6f42c1&labelColor=1a1a2e">
        <img src="https://img.shields.io/packagist/l/silarhi/turbo-bundle?style=for-the-badge&color=6f42c1" alt="License">
    </picture>
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/packagist/php-v/silarhi/turbo-bundle?style=for-the-badge&color=777bb4&labelColor=1a1a2e">
        <img src="https://img.shields.io/packagist/php-v/silarhi/turbo-bundle?style=for-the-badge&color=777bb4" alt="PHP Version">
    </picture>
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/github/actions/workflow/status/silarhi/turbo-bundle/continuous-integration.yml?style=for-the-badge&label=CI&color=20c997&labelColor=1a1a2e">
        <img src="https://img.shields.io/github/actions/workflow/status/silarhi/turbo-bundle/continuous-integration.yml?style=for-the-badge&label=CI&color=20c997"
            alt="CI Status">
    </picture>
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsilarhi%2Fturbo-bundle%2Fbadges%2Fcoverage.json&style=for-the-badge&labelColor=1a1a2e">
        <img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsilarhi%2Fturbo-bundle%2Fbadges%2Fcoverage.json&style=for-the-badge" alt="Coverage">
    </picture>
    <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/@silarhi/turbo?style=for-the-badge&label=npm&color=cb3837&labelColor=1a1a2e">
        <img src="https://img.shields.io/npm/v/@silarhi/turbo?style=for-the-badge&label=npm&color=cb3837" alt="npm Version">
    </picture>
</p>

<h1 align="center">Turbo Bundle</h1>

<p align="center">
    <strong>Two small, framework-agnostic <a href="https://turbo.hotwired.dev/">Hotwire Turbo</a> helpers.</strong><br>
    A TypeScript lifecycle orchestrator for the browser and a Symfony-components frame-redirect listener for the server — each usable on its own.
</p>

<p align="center">
    📖 <a href="https://turbo-bundle.silarhi.dev"><strong>Documentation</strong></a>
</p>

---

The two halves solve different problems and only meet on redirect following (the server escalates a frame redirect to a
`Turbo-Location` header, the browser handler follows it):

- **[`@silarhi/turbo`](https://www.npmjs.com/package/@silarhi/turbo)** (JS/TS): a `TurboHandler` that runs a single
  pair of `onMount` / `onUnmount` callbacks across every Turbo Drive, Frame and Stream render.
- **`silarhi/turbo-bundle`** (PHP): a listener that turns a redirect issued inside a Turbo Frame into a full Drive
  visit, plus the `turbo_frame` Twig filter. Symfony components only, no `symfony/framework-bundle` required.

## Features

- **One lifecycle hook pair**: `onMount` / `onUnmount` run on Drive renders, frame loads and Stream mutations alike
- **Morph-aware**: Stream renders are diffed per node; Drive and Frame morphs can opt into per-element refresh
- **Frame-redirect following**: a redirect inside a Turbo Frame becomes a full Drive visit, `DELETE` redirects too
- **`turbo_frame` Twig filter**: extend a lean frame template only when the request targets a matching frame
- **Framework-optional**: the bundle gives zero-config wiring; the classes also work standalone

## Requirements

- PHP 8.2+ and Symfony components 6.4, 7.x or 8.x
- `@hotwired/turbo` 7.1+ or 8.x for `@silarhi/turbo` (following `DELETE` redirects outside a frame needs Turbo 8)

## Installation

```bash
composer require silarhi/turbo-bundle # PHP half
pnpm add @silarhi/turbo               # JS half
```

```php
// config/bundles.php
return [
    // ...
    Silarhi\TurboBundle\SilarhiTurboBundle::class => ['all' => true],
];
```

## Quick start

```ts
import { TurboHandler } from '@silarhi/turbo'

new TurboHandler({
    onMount: (container) => app.mount(container),
    onUnmount: (container) => app.unmount(container),
}).start()
```

Your widgets now mount and unmount on every Turbo render, and a redirect answered to a frame request becomes a full
page visit. Render a lean layout inside frames with `{% extends 'base.html.twig'|turbo_frame('main') %}`, after
creating that layout in `templates/base-frame.html.twig` (see the
[quick start](https://turbo-bundle.silarhi.dev/getting-started/quick-start/#3-render-a-lean-template-inside-frames)).

## Documentation

Everything else is on **[turbo-bundle.silarhi.dev](https://turbo-bundle.silarhi.dev)**:

- [Installation](https://turbo-bundle.silarhi.dev/getting-started/installation/) and [quick start](https://turbo-bundle.silarhi.dev/getting-started/quick-start/)
- JavaScript: [`TurboHandler`](https://turbo-bundle.silarhi.dev/javascript/turbo-handler/), [stream mutations](https://turbo-bundle.silarhi.dev/javascript/stream-mutations/), [morph mutations](https://turbo-bundle.silarhi.dev/javascript/morph-mutations/), [frame responses without a matching frame](https://turbo-bundle.silarhi.dev/javascript/frame-missing/), [keeping a redirect in its frame](https://turbo-bundle.silarhi.dev/javascript/follow-redirect/)
- PHP: [frame-redirect following](https://turbo-bundle.silarhi.dev/php/frame-redirects/), [the `turbo_frame` Twig filter](https://turbo-bundle.silarhi.dev/php/turbo-frame-filter/), [without the framework](https://turbo-bundle.silarhi.dev/php/without-framework/)
- Reference: [configuration](https://turbo-bundle.silarhi.dev/reference/configuration/), [`TurboHandler` options](https://turbo-bundle.silarhi.dev/reference/turbo-handler/), [PHP API](https://turbo-bundle.silarhi.dev/reference/php-api/), [HTTP headers](https://turbo-bundle.silarhi.dev/reference/http-headers/)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Release notes are in [CHANGELOG.md](CHANGELOG.md).

## License

Released under the [MIT License](LICENSE).
