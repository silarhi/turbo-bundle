# Contributing

Contributions are welcome! Bug reports and feature requests go to the
[issue tracker](https://github.com/silarhi/turbo-bundle/issues), changes to a pull request against `main`.

The repository holds two packages released from the same git tag: the Composer package `silarhi/turbo-bundle` (`src/`,
`tests/`) and the npm package `@silarhi/turbo` (`assets/`).

## Setup

```bash
# PHP half
composer install

# Repository tooling: husky pre-commit hook, lint-staged, Prettier
pnpm install

# JS half
cd assets
pnpm install
```

The JS packages use [pnpm](https://pnpm.io), its version pinned by `packageManager` in each `package.json`.

## Quality checks

The CI runs PHPUnit on PHP 8.2 to 8.5, each with the lowest and the latest allowed dependencies; PHPStan, PHP CS
Fixer and the `composer.json` checks on PHP 8.2; the JS checks on Node 26; the end-to-end tests on Turbo 7.2 and 8.
Make sure your changes pass before submitting a pull request:

```bash
composer test && vendor/bin/phpstan analyse && vendor/bin/php-cs-fixer fix --dry-run --diff && (cd assets && pnpm lint && pnpm typecheck && pnpm test)
```

### PHP half

```bash
# Tests
composer test

# Static analysis (level: max)
vendor/bin/phpstan analyse

# Code style (drop --dry-run --diff to fix)
vendor/bin/php-cs-fixer fix --dry-run --diff

# Code modernization, not run by the CI (drop --dry-run to apply)
vendor/bin/rector process --dry-run

# composer.json
composer validate --strict
composer normalize --dry-run --diff
```

### JS half (in `assets/`)

```bash
pnpm test        # vitest (pnpm test:watch to rerun on change)
pnpm lint        # biome (pnpm lint:fix to apply fixes)
pnpm typecheck   # tsc --noEmit
pnpm build       # tsdown → dist/
pnpm e2e         # Playwright, see below
```

### End-to-end tests

`assets/e2e` runs `TurboHandler` and `TurboFrameListener` against the real Turbo of `assets/node_modules`, in Chromium:
Playwright serves the application of `tests/E2E` with `php -S tests/E2E/router.php`, wired with Symfony components
only. Each page logs the mounts and unmounts of its `[data-widget]` elements, for the tests to read.

```bash
composer install                                # the PHP half, for the application
pnpm exec playwright install chromium           # once
pnpm e2e                                        # builds dist/, then runs the tests
pnpm add -D @hotwired/turbo@7.2.0 && pnpm e2e   # on the lowest Turbo, as the CI does (revert the change after)
```

## Releases

Both packages are released from the same git tag. Publishing a GitHub Release publishes `@silarhi/turbo` to npm, with
the version taken from the tag: never bump `assets/package.json` by hand. Release notes go to
[CHANGELOG.md](CHANGELOG.md).

## Documentation

The documentation site, [turbo-bundle.silarhi.dev](https://turbo-bundle.silarhi.dev), is built from the
[`docs/`](docs) folder with [Starlight](https://starlight.astro.build). Document a change in the same pull request:

```bash
cd docs
pnpm install
pnpm dev # http://localhost:4321
```

Pull requests touching `docs/` build the site; it is published once merged into `main`. Keep `README.md` and
`assets/README.md` (the npm package page) short: update them only when the features or the quick start change.

## License

By contributing, you agree that your contributions are released under the [MIT License](LICENSE).
