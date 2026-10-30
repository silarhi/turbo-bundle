# Changelog

All notable changes to `silarhi/turbo-bundle` (Composer) and `@silarhi/turbo` (npm) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Both packages are released from the
same git tag; since 0.2.1 the npm package version follows that tag.

## [0.10.0] - Unreleased

### Changed

- The end-to-end tests cover every way Turbo morphs (Drive refresh, a refresh asked by a stream, frames with
  `refresh="morph"`, streams with `method="morph"`), with and without `morphMutations`, and `data-turbo-permanent`,
  `turbo-cache-control`, eager and lazy frames, `_top`, prefetch and view transitions.
- `TurboHandler` mounts and unmounts at the swap itself: it wraps the `render` function of `turbo:before-render` and
  `turbo:before-frame-render`, so `onMount` now runs before `turbo:render`, `turbo:frame-render` and `turbo:frame-load`
  instead of on `turbo:load` / `turbo:frame-load`. It keeps the elements it mounted rather than tracking the order of
  Turbo's events, which every race fixed below came from; only the first page is mounted on `turbo:load`. The handler
  is split into modules, and its streams, morphs and the streams of the page share one DOM diff.

### Fixed

- A Turbo Stream with `method="morph"` (`replace` or `update`) re-mounts its targets. Turbo morphs them in place,
  which the child list diff of `streamMutations` doesn't see: nothing was unmounted or mounted, and a widget in the
  target (a Tom Select) lost its markup and stopped working. Each target is now unmounted before the render and mounted
  after, like a frame.
- `morphMutations` unmounts the elements a morph removes, and mounts the ones it adds. Turbo fires
  `turbo:before-morph-element` without a new element for a removed one, and nothing for an added one: the removed
  widgets leaked, and the added ones were never mounted.
- `morphMutations` keeps the value the server sends to a widget it re-mounts. The handler unmounted a changed element
  after the morph: Tom Select's `destroy()` then put back the `<option>` elements it found at init, with the old
  selected value. A widget re-mounted in the middle of a stream morph also lost its markup, which the rest of the morph
  removed. Changed elements are now unmounted before the morph touches them, and mounted once the whole morph is done.
- `morphMutations` no longer mounts the widgets of a `<turbo-frame refresh="morph">` twice. Turbo 8 reports a frame
  morph as `renderMethod: "replace"`: the handler re-mounted the whole frame on top of its elements. It now tells a
  frame morph from its render function.
- The widgets inside a `data-turbo-permanent` element stay mounted, with their state, across Drive visits, Back and
  previews from the cache, frame navigations, morph refreshes and streams. Turbo moves the element to the new content,
  but the handler unmounted and mounted it with the rest of the page: a Tom Select went back to its first value. The
  handler now moves the elements Turbo keeps out of their container while it calls `onUnmount` / `onMount` on it
  (with `moveBefore()` where the browser has it, which keeps an iframe or a video playing). The snapshot cache gets
  the markup each one had before its first mount. A stream that keeps one inserts a copy of it: the handler puts the
  element back in place of the copy.
- A frame that renders before the first `turbo:load`, or while a Drive render is in flight, is mounted once. The body
  mount mounted it a second time ("Tom Select already initialized"), after `turbo:frame-load` or between the frame
  render and its `turbo:frame-load`.
- The nodes a `<turbo-stream>` of the page itself inserts are mounted. Turbo renders it once imported, before the app
  starts the handler, which never saw its `turbo:before-stream-render`: they were mounted only when the render came
  before the first `turbo:load`.
- With `morphMutations`, a stream `replace` morph that targets a widget (a `<select>` with a Tom Select) no longer
  removes the nodes after it. The handler unmounted the target in the middle of the morph, removing the markup Turbo
  stops the morph at; it now unmounts a target that changes before the render.

## [0.9.0] - 2026-10-30

### Changed

- `@silarhi/turbo` requires `@hotwired/turbo` 7.2+ (was 7.1+). Turbo 7.1 lacks `turbo:before-frame-render` and the
  `render` hook of `turbo:before-stream-render`: a frame navigation did not unmount the old frame content, and the
  nodes a stream inserted were not mounted.
- The CI runs end-to-end tests: `TurboHandler` and `TurboFrameListener` against the real Turbo in Chromium, on Turbo
  7.2 and 8 (`assets/e2e`, `tests/E2E`), with a real Tom Select across `422` forms, a search form targeting a results
  frame, the snapshot cache and morph refreshes.

### Fixed

- `morphMutations` no longer re-mounts the whole page on a Drive morph refresh. Turbo fires `turbo:morph-element` for
  every element the morph matched, the unchanged ones and `<body>` included, and `onMount(<body>)` re-initialized every
  listener. The handler now compares each element with its new markup on `turbo:before-morph-element`, and only
  re-mounts the elements whose attributes or own child nodes change.
- `TurboFrameListener` follows `DELETE` redirects outside a frame with Turbo 7 too. `TurboManager::isTurboRequest()`
  only read the `X-Turbo-Request-Id` header, which Turbo sends since 8.0: it also recognizes the
  `text/vnd.turbo-stream.html` that Turbo 7 and 8 accept on their form submissions. The browser no longer re-sends the
  `DELETE` to the redirect target.
- Back after a frame navigation promoted to a page visit (`data-turbo-action="advance"`, such as a search form that
  targets a results frame) no longer restores the widgets of the page twice. Turbo caches a copy of that page taken
  while it stays on screen (Turbo 8 takes it when the navigation starts), with what listeners added to it, such as a
  Tom Select's markup, and no `turbo:before-cache` listener can clean it. `TurboHandler` keeps these visits out of the
  snapshot cache (`shouldCacheSnapshot: false`, by wrapping `Turbo.session.visit`): Back loads that page from the
  server. Turbo then no longer fires `turbo:before-cache` on a page that stays on screen either, which removed its
  `[data-turbo-temporary]` elements (hotwired/turbo#1553).

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
[0.10.0]: https://github.com/silarhi/turbo-bundle/compare/v0.9.0...v0.10.0
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
