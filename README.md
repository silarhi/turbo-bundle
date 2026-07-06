# Turbo Bundle

Framework-agnostic [Hotwire Turbo](https://turbo.hotwired.dev/) lifecycle helpers, split in two reusable halves:

- **`@silarhi/turbo`** (JS/TS) — a `TurboHandler` that wires the Turbo Drive / Frame / Stream
  lifecycle to a single pair of `onMount` / `onUnmount` callbacks, so your per-container listeners
  (tooltips, selects, datepickers, …) initialise and clean up correctly across **every** Turbo
  navigation — including Stream / Mercure mutations, which fire no render event of their own.
- **`silarhi/turbo-bundle`** (PHP) — a `TurboManager` + `TurboFrameListener` that turn a redirect
  issued inside a Turbo Frame into a `204 + Turbo-Location`, escalating it to a full Drive visit.
  Depends on Symfony **components only** — no `symfony/framework-bundle` — so it works in projects
  that wire an event dispatcher by hand.

The two halves implement opposite ends of the same redirect-following contract, but each is usable
on its own.

## Installation

```bash
composer require silarhi/turbo-bundle
yarn add @silarhi/turbo
```

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

| Option            | Type                                         | Default              | Purpose                                                                                  |
| ----------------- | -------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| `onMount`         | `(container: Element \| Document) => void`   | —                    | Init your listeners on a freshly rendered / inserted element.                            |
| `onUnmount`       | `(container: Element \| Document) => void`   | —                    | Tear them down before the element leaves the DOM.                                        |
| `getContainer`    | `(document: Document) => Element`            | `document.body`      | Root element a full Drive render mounts on.                                              |
| `onRedirect`      | `(url: string) => void`                      | `Turbo.visit(url)`   | Follow a server `Turbo-Location` redirect.                                               |
| `streamMutations` | `boolean`                                    | `true`               | Diff the DOM around each Turbo Stream render and mount/unmount the nodes it touched.      |
| `morphMutations`  | `boolean`                                    | `false`              | Handle Drive/Frame **morph** renders per-node via `turbo:morph-element` instead of re-initializing the whole container. |

### `streamMutations` (the "morph" switch)

By default the handler observes the DOM around every `turbo:before-stream-render`, then mounts the
nodes a Stream inserted and unmounts the ones it removed. It is **morph-aware**: a reused node may be
reported as both removed and added, and the policy is *mount-wins* (never unmount-then-remount, never
double-mount). Pass `streamMutations: false` to opt out and keep stock Turbo behaviour.

### `morphMutations` (Drive & Frame morphs)

`streamMutations` covers Turbo **Stream** morphs (`<turbo-stream method="morph">`). The other two
morph paths — Drive page refresh (`<meta name="turbo-refresh-method" content="morph">`) and frame
refresh (`<turbo-frame refresh="morph">`) — fire `turbo:before-render`/`turbo:before-frame-render`
with `renderMethod: "morph"` and morph the container **in place**. By default the handler treats them
like a replace: it unmounts then re-mounts the whole container, re-initializing listeners even on the
nodes the morph preserved.

Set `morphMutations: true` to instead skip that coarse re-init on morph renders and refresh only the
nodes Turbo actually morphed, via the `turbo:morph-element` event — leaving preserved widgets (an open
select, a focused field) untouched. Scope: it covers elements morphed **in place**; subtrees a morph
adds or removes wholesale aren't re-mounted by this path. It requires `onMount`/`onUnmount` to be safe
to call on an individual element.

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

`TurboManager` and `TurboFrameListener` are now registered (the listener is tagged
`kernel.event_subscriber` automatically), plus the `turbo_frame` Twig filter when Twig is installed.

Configure it (default values shown):

```yaml
# config/packages/silarhi_turbo.yaml
silarhi_turbo:
    base_template: 'base-frame.html.twig'   # template the turbo_frame filter falls back to
    follow_delete_redirects: true           # convert DELETE-request redirects to a Turbo-Location visit
```

### `turbo_frame` Twig filter

Render a full template on a normal request, but a lean frame template when the
request targets a (matching) Turbo Frame — without branching in every action:

```twig
{# convention: use project/show-frame.html.twig if it exists, #}
{# otherwise fall back to the configured base_template          #}
{% extends 'project/show.html.twig'|turbo_frame('project-details') %}

{# or pass an explicit base template (skips the -frame lookup) #}
{% extends 'project/show.html.twig'|turbo_frame('project-details', 'layout/_frame.html.twig') %}
```

When the frame matches and you don't pass a base template, the filter first looks for a
**`-frame` sibling** of the template (`project/show.html.twig` → `project/show-frame.html.twig`).
If that template exists it wins; otherwise the filter falls back to the configured
`base_template`. Passing an explicit base template skips the sibling lookup entirely.

Omit the frame id (`'project/show.html.twig'|turbo_frame`) to match **any** Turbo Frame request.

### Without the framework (components only)

```php
use Silarhi\TurboBundle\EventListener\TurboFrameListener;
use Silarhi\TurboBundle\TurboManager;

$turboManager = new TurboManager($requestStack);
$dispatcher->addSubscriber(new TurboFrameListener($turboManager));
```

`TurboFrameListener` also follows `DELETE` redirects on Turbo requests by default; pass
`new TurboFrameListener($turboManager, followDeleteRedirects: false)` to disable that.

## Development

```bash
# PHP
composer install
composer test                 # phpunit
vendor/bin/phpstan analyse
vendor/bin/php-cs-fixer fix
vendor/bin/rector process

# JS (in assets/)
cd assets
yarn install
yarn test                     # vitest
yarn lint                     # biome
yarn typecheck                # tsc --noEmit
yarn build                    # tsdown → dist/
```

## License

MIT © SILARHI
