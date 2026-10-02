# Changelog

All notable changes to `silarhi/turbo-bundle` (Composer) and `@silarhi/turbo` (npm) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Both packages are released from the
same git tag; since 0.2.1 the npm package version follows that tag.

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

[0.3.1]: https://github.com/silarhi/turbo-bundle/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/silarhi/turbo-bundle/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/silarhi/turbo-bundle/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/silarhi/turbo-bundle/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/silarhi/turbo-bundle/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/silarhi/turbo-bundle/releases/tag/v0.2.0
