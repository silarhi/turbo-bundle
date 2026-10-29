# Changelog

All notable changes to `silarhi/turbo-bundle` (Composer) and `@silarhi/turbo` (npm) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Both packages are released from the
same git tag; since 0.2.1 the npm package version follows that tag.

## [0.9.0] - Unreleased

### Changed

- The CI runs end-to-end tests: `TurboHandler` and `TurboFrameListener` against the real Turbo in Chromium, on Turbo
  7.2 and 8 (`assets/e2e`, `tests/E2E`).

### Fixed

- `morphMutations` no longer re-mounts the whole page on a Drive morph refresh. Turbo fires `turbo:morph-element` for
  every element the morph matched, the unchanged ones and `<body>` included, and `onMount(<body>)` re-initialized every
  listener. The handler now compares each element with its new markup on `turbo:before-morph-element`, and only
  re-mounts the elements whose attributes or own child nodes change.
- `TurboFrameListener` follows `DELETE` redirects outside a frame with Turbo 7 too. `TurboManager::isTurboRequest()`
  only read the `X-Turbo-Request-Id` header, which Turbo sends since 8.0: it also recognizes the
  `text/vnd.turbo-stream.html` that Turbo 7 and 8 accept on their form submissions. The browser no longer re-sends the
  `DELETE` to the redirect target.

## [0.8.3] - 2026-10-29

### Fixed

- Responses that depend on the `Turbo-Frame` request header now send `Vary: Turbo-Frame`: a page rendered through the
  `turbo_frame` filter or the `turbo_frame_request()` / `turbo_frame_id()` functions, and a frame redirect converted to
  `Turbo-Location`. A shared cache (HttpCache, Varnish, a CDN) could otherwise store the frame layout of a public page
  for a request sent with `Turbo-Frame: x` and serve it to every visitor. `TurboManager` flags the current and the main
  request when it reads the header, and `TurboFrameListener` adds the `Vary` from that flag, so responses that never
  read it are left alone.

## [0.8.2] - 2026-10-29

### Changed

- No change to the library code: dependency updates, and `composer.json` links the documentation site.
- The npm package is published by a hardened workflow: build and publish in separate jobs, actions pinned by SHA,
  release tags must be on `main`.

## [0.8.1] - 2026-10-22

### Fixed

- `TurboHandler` no longer unmounts and re-mounts the whole `<body>` after a `data-turbo-action` frame navigation:
  Turbo 8 promotes it to a page visit with `willRender: false`, which still fires `turbo:before-render` and
  `turbo:render` while keeping the body in place. Only the frame is re-mounted now, so the listeners around it (a Tom
  Select in a filter panel, a datepicker) keep their state. Detected through the visit in flight
  (`window.Turbo.session.navigator.currentVisit`).
- `TurboHandler` unmounts the body on `turbo:before-cache`, so Turbo's snapshot cache holds the server DOM and not what
  listeners added. Turbo clones the page one tick after that event, which comes before `turbo:before-render` when the
  next page brings a stylesheet still loading: a restored or previewed page then got its widgets twice. The next
  `turbo:load` mounts the body again, even after a render that doesn't (a morph). `onUnmount` can therefore run twice
  for one visit (`turbo:before-cache`, then `turbo:before-render`). Known limit: a promoted frame visit caches a copy of
  the page Turbo takes when the frame navigation starts, with the listeners' DOM in it, so going back to a page whose
  `data-turbo-action` frame navigated still restores it; keep `turbo-cache-control: no-cache` if listeners rewrite the
  DOM there.

## [0.8.0] - 2026-10-21

### Changed

- `symfony/config` and `symfony/dependency-injection` are no longer required: only `SilarhiTurboBundle` uses them, and
  `symfony/framework-bundle` already brings them. A project that uses `TurboManager`, `TurboFrameListener` and
  `TurboExtension` without the bundle now installs HttpFoundation, HttpKernel and EventDispatcher only. A project that
  registers the bundle without `symfony/framework-bundle` must now require `symfony/dependency-injection` and
  `symfony/config` itself.

## [0.7.0] - 2026-10-20

### Added

- `TurboHandler` `frameStreams` option (off by default): run the `<turbo-stream>` elements a frame response carries
  outside any `<turbo-frame>`, which Turbo otherwise discards, so a frame layout can update the page around the frame
  (e.g. append its flash messages) with the same markup as a Turbo Stream response.

## [0.6.0] - 2026-10-17

### Added

- `turbo_frame_request(frameId = null)` and `turbo_frame_id()` Twig functions: branch a template on the requesting frame
  (`{% extends turbo_frame_request('modal') ? 'base-frame.html.twig' : 'base-modal.html.twig' %}`) and echo it back
  (`<turbo-frame id="{{ turbo_frame_id() }}">`).

## [0.5.0] - 2026-10-12

### Added

- Documentation site: [turbo-bundle.silarhi.dev](https://turbo-bundle.silarhi.dev). The README is now a short landing
  page linking to it.

### Changed

- `TurboManager` no longer throws a `RuntimeException` ("No request available") when the `RequestStack` has no current
  request: every method answers as for a plain, non-Turbo request (`false`, or `null` for `getTurboFrameId()`). The
  `turbo_frame` Twig filter therefore returns the template unchanged in console commands, message handlers and emails
  rendered outside a request.
- A frame with `data-turbo-follow-redirect` (request header `Turbo-Frame-Follow-Redirect`) now keeps all its redirects:
  `TurboFrameListener` no longer converts its `DELETE` redirects while `follow_delete_redirects` is on. Answer such
  `DELETE` requests with a `303 See Other` so the browser follows them with a `GET`.
- `@silarhi/turbo`: the `onMount` / `onUnmount` options are typed `(container: Element) => void`, the only value the
  handler ever passed. Callbacks typed `(container: Element | Document) => void` are still accepted.

### Fixed

- `TurboFrameListener` dropped the headers and cookies of the redirect it replaced with the `204` + `Turbo-Location`
  response. They are now copied over; only the status, `Location` (moved to `Turbo-Location`), `Content-Type` and
  `Content-Length` change.
- `@silarhi/turbo`: without the `window.Turbo` global, the default `onRedirect` did nothing, leaving the page unchanged
  after cancelling the response. It now falls back to a full page load (`window.location.assign(url)`) and logs a
  warning.

## [0.4.1] - 2026-10-12

### Fixed

- `TurboFrameListener` turned a `304 Not Modified` answered to a Turbo Frame request (a frame revalidated with an `ETag`
  or `Last-Modified`) into a `204` with an empty `Turbo-Location`, so the frame rendered empty instead of its cached
  copy. Only redirections carrying a `Location` header are converted now.
- The `turbo_frame` filter's `-frame` sibling convention renamed the first dot of the whole path: for
  `v1.2/page.html.twig` it looked for `v1-frame.2/page.html.twig` and fell back to the base template. It now inserts
  `-frame` before the first dot of the file name (`v1.2/page-frame.html.twig`).

## [0.4.0] - 2026-10-07

### Added

- `TurboHandler` option `visitOnFrameMissing`: when a frame response has no matching `<turbo-frame>`
  (`turbo:frame-missing`), render it as a full Drive visit instead of Turbo's "Content missing" error. Off by default.

## [0.3.1] - 2026-10-01

### Fixed

- npm publishing: the release workflow broke with `actions/setup-node` v7 and `@silarhi/turbo@0.3.1` initially failed to
  publish. The workflow was fixed and 0.3.1 was published to npm on 2026-10-02.

### Changed

- No runtime changes: same PHP / Symfony / Twig / `@hotwired/turbo` requirements as 0.3.0.
- Test suite now covers bundle configuration and service wiring, listener subscription and the `turbo_frame` filter, and
  CI runs against the real lowest dependency versions.
- README restyled like the other SILARHI packages, with a coverage badge.

## [0.3.0] - 2026-07-06

### Added

- `turbo_frame` Twig filter: inside a matching Turbo Frame, and when no explicit base template is passed, the filter
  first looks for a `-frame` sibling of the template (`page.html.twig` → `page-frame.html.twig`) before falling back to
  the configured `base_template`. Passing an explicit base template skips the lookup.
- README for the `@silarhi/turbo` npm package page.

## [0.2.3] - 2026-06-24

### Changed

- Development dependency and CI updates only; no runtime changes.

## [0.2.2] - 2026-06-24

### Fixed

- npm publishing via OIDC Trusted Publishing (the 0.2.0 and 0.2.1 releases never reached npm). 0.2.2 is the first npm
  release published by the release workflow.

## [0.2.1] - 2026-06-24

### Changed

- The npm package version is now taken from the git tag at publish time (no manual `package.json` bump).

## [0.2.0] - 2026-06-24

First tagged release. (`@silarhi/turbo@0.1.0` was published to npm ahead of it, without a matching git tag.)

### Added

- `@silarhi/turbo` (TypeScript): `TurboHandler` with `start()` / `stop()`, wiring Turbo Drive / Frame / Stream renders to
  a single `onMount` / `onUnmount` pair; `getContainer` and `onRedirect` options; `streamMutations` (on by default,
  morph-aware per-node handling of Stream renders) and opt-in `morphMutations` for Drive / Frame morphs.
- `silarhi/turbo-bundle` (PHP): `TurboManager` and `TurboFrameListener`, turning a redirect issued inside a Turbo Frame
  into a `204` + `Turbo-Location` full Drive visit (also for `DELETE` requests), using Symfony components only.
- Optional `SilarhiTurboBundle` for zero-config wiring, configurable via `silarhi_turbo.base_template` and
  `silarhi_turbo.follow_delete_redirects`.
- `turbo_frame` Twig filter (registered when Twig is installed) to extend a lean frame template when the request targets
  a matching Turbo Frame.

[Unreleased]: https://github.com/silarhi/turbo-bundle/compare/v0.8.3...HEAD
[0.9.0]: https://github.com/silarhi/turbo-bundle/compare/v0.8.3...v0.9.0
[0.8.3]: https://github.com/silarhi/turbo-bundle/compare/v0.8.2...v0.8.3
[0.8.2]: https://github.com/silarhi/turbo-bundle/compare/v0.8.1...v0.8.2
[0.8.1]: https://github.com/silarhi/turbo-bundle/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/silarhi/turbo-bundle/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/silarhi/turbo-bundle/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/silarhi/turbo-bundle/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/silarhi/turbo-bundle/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/silarhi/turbo-bundle/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/silarhi/turbo-bundle/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/silarhi/turbo-bundle/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/silarhi/turbo-bundle/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/silarhi/turbo-bundle/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/silarhi/turbo-bundle/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/silarhi/turbo-bundle/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/silarhi/turbo-bundle/releases/tag/v0.2.0
