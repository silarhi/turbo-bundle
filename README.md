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

---

The two halves solve different problems and only meet on redirect following (the server escalates a frame redirect to a
`Turbo-Location` header, the browser handler follows it):

- **[`@silarhi/turbo`](https://www.npmjs.com/package/@silarhi/turbo)** (JS/TS, [docs](assets/README.md)) — a
  **lifecycle orchestrator**: a `TurboHandler` that wires the Turbo Drive / Frame / Stream lifecycle to a single pair
  of `onMount` / `onUnmount` callbacks, so your per-container listeners (tooltips, selects, datepickers, …) initialise
  and clean up correctly across **every** Turbo navigation — including Stream / Mercure mutations, which fire no render
  event of their own.
- **`silarhi/turbo-bundle`** (PHP) — **frame-redirect following**: a `TurboManager` + `TurboFrameListener` that turn a
  redirect issued inside a Turbo Frame into a `204 + Turbo-Location`, escalating it to a full Drive visit (plus the
  optional `turbo_frame` Twig filter). Depends on Symfony **components only** — no `symfony/framework-bundle` — so it
  works in projects that wire an event dispatcher by hand.

## Features

- **One lifecycle hook pair** — `onMount` / `onUnmount` run on Drive renders, frame loads and Stream mutations alike.
- **Morph-aware** — Stream renders are diffed per node (mount-wins, never double-mount); Drive and Frame morphs can
  opt into per-element refresh.
- **Frame-redirect following** — a redirect inside a Turbo Frame becomes a full Drive visit instead of a frame swap.
- **`DELETE` redirects** — redirects answering a Turbo `DELETE` request are followed too (configurable).
- **`turbo_frame` Twig filter** — extend a lean frame template only when the request targets a matching frame.
- **Framework-optional** — the optional bundle gives zero-config wiring; the classes also work standalone.

## Requirements

| Dependency                                                                                               | Version         |
| -------------------------------------------------------------------------------------------------------- | --------------- |
| PHP                                                                                                      | 8.2+            |
| Symfony components (config, dependency-injection, event-dispatcher, http-foundation, http-kernel)        | 6.4 / 7.x / 8.x |
| [`@hotwired/turbo`](https://www.npmjs.com/package/@hotwired/turbo) (peer dependency of `@silarhi/turbo`) | 7.1+ / 8.x      |

### Optional Dependencies

| Package                    | Required for                                                    |
| -------------------------- | --------------------------------------------------------------- |
| `symfony/framework-bundle` | Registering `SilarhiTurboBundle` for zero-config service wiring |
| `twig/twig`                | The `turbo_frame` Twig filter                                   |

## Installation

```bash
# PHP half
composer require silarhi/turbo-bundle

# JS half
yarn add @silarhi/turbo
```

The npm package is published as [`@silarhi/turbo`](https://www.npmjs.com/package/@silarhi/turbo); its own README
([`assets/README.md`](assets/README.md)) documents the JS half in more detail.

## JavaScript — `TurboHandler`

```ts
import { TurboHandler } from '@silarhi/turbo'

const handler = new TurboHandler({
    onMount: (container) => app.mount(container),
    onUnmount: (container) => app.unmount(container),
})

handler.start() // attach listeners (idempotent)
// handler.stop() // detach them all and reset
```

### Options

| Option            | Type                                       | Default            | Purpose                                                                                                                 |
| ----------------- | ------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `onMount`         | `(container: Element \| Document) => void` | —                  | Init your listeners on a freshly rendered / inserted element.                                                           |
| `onUnmount`       | `(container: Element \| Document) => void` | —                  | Tear them down before the element leaves the DOM.                                                                       |
| `getContainer`    | `(document: Document) => Element`          | `document.body`    | Root element a full Drive render mounts on.                                                                             |
| `onRedirect`      | `(url: string) => void`                    | `Turbo.visit(url)` | Follow a server `Turbo-Location` redirect.                                                                              |
| `streamMutations` | `boolean`                                  | `true`             | Diff the DOM around each Turbo Stream render and mount/unmount the nodes it touched.                                    |
| `morphMutations`  | `boolean`                                  | `false`            | Handle Drive/Frame **morph** renders per-node via `turbo:morph-element` instead of re-initializing the whole container. |

### `streamMutations` (the "morph" switch)

By default the handler observes the DOM around every `turbo:before-stream-render`, then mounts the nodes a Stream
inserted and unmounts the ones it removed. It is **morph-aware**: a reused node may be reported as both removed and
added, and the policy is _mount-wins_ (never unmount-then-remount, never double-mount). Pass `streamMutations: false` to
opt out and keep stock Turbo behaviour.

### `morphMutations` (Drive & Frame morphs)

`streamMutations` covers Turbo **Stream** morphs (`<turbo-stream method="morph">`). The other two morph paths — Drive
page refresh (`<meta name="turbo-refresh-method" content="morph">`) and frame refresh (`<turbo-frame refresh="morph">`)
— fire `turbo:before-render`/`turbo:before-frame-render` with `renderMethod: "morph"` and morph the container **in
place**. By default the handler treats them like a replace: it unmounts then re-mounts the whole container,
re-initializing listeners even on the nodes the morph preserved.

Set `morphMutations: true` to instead skip that coarse re-init on morph renders and refresh only the nodes Turbo
actually morphed, via the `turbo:morph-element` event — leaving preserved widgets (an open select, a focused field)
untouched. Scope: it covers elements morphed **in place**; subtrees a morph adds or removes wholesale aren't re-mounted
by this path. It requires `onMount`/`onUnmount` to be safe to call on an individual element.

### Keeping a redirect inside its frame

Add `data-turbo-follow-redirect` to a `<turbo-frame>` to opt it out of the escalation: the handler sends a
`Turbo-Frame-Follow-Redirect` header with that frame's requests, and `TurboFrameListener` leaves their redirects
untouched.

## PHP — frame-redirect following

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
automatically), plus the `turbo_frame` Twig filter when Twig is installed.

Configure it (default values shown):

```yaml
# config/packages/silarhi_turbo.yaml
silarhi_turbo:
    base_template: 'base-frame.html.twig' # template the turbo_frame filter falls back to
    follow_delete_redirects: true # convert DELETE-request redirects to a Turbo-Location visit
```

### `turbo_frame` Twig filter

Render a full template on a normal request, but a lean frame template when the request targets a (matching) Turbo
Frame — without branching in every action:

```twig
{# convention: use project/show-frame.html.twig if it exists, #}
{# otherwise fall back to the configured base_template          #}
{% extends 'project/show.html.twig'|turbo_frame('project-details') %}

{# or pass an explicit base template (skips the -frame lookup) #}
{% extends 'project/show.html.twig'|turbo_frame('project-details', 'layout/_frame.html.twig') %}
```

When the frame matches and you don't pass a base template, the filter first looks for a **`-frame` sibling** of the
template (`project/show.html.twig` → `project/show-frame.html.twig`). If that template exists it wins; otherwise the
filter falls back to the configured `base_template`. Passing an explicit base template skips the sibling lookup
entirely.

Omit the frame id (`'project/show.html.twig'|turbo_frame`) to match **any** Turbo Frame request.

### Without the framework (components only)

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

## Testing & Quality

```bash
# Install dependencies
composer install

# Run tests
composer test

# Static analysis (level: max)
vendor/bin/phpstan analyse

# Code style check
vendor/bin/php-cs-fixer fix --dry-run --diff

# Code style fix
vendor/bin/php-cs-fixer fix

# Code modernization check
vendor/bin/rector process --dry-run

# JS half (in assets/)
cd assets
yarn install
yarn test        # vitest
yarn lint        # biome (yarn lint:fix to apply fixes)
yarn typecheck   # tsc --noEmit
yarn build       # tsdown → dist/
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## Contributing

Contributions are welcome! Please make sure your changes pass all quality checks before submitting a pull request:

```bash
composer test && vendor/bin/phpstan analyse && vendor/bin/php-cs-fixer fix --dry-run --diff && (cd assets && yarn lint && yarn typecheck && yarn test)
```

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<p align="center">
    Built with care by <a href="https://github.com/silarhi">SILARHI</a>.<br>
    If Turbo Bundle saves you time, consider giving it a star on GitHub.
</p>
