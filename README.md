# Nutrio

Practice management for registered dietitians and nutritionists — meal planning, client compliance tracking, and USDA-backed nutrient calculations.

Every specialised competitor (Practice Better, Healthie, Nutrium) is a paid, standalone cloud SaaS. Nutrio is self-hosted, at a fraction of their monthly cost, with the same core workflow: a practitioner builds an individualized meal plan, a client logs what they actually ate, and both sides see accurate, USDA-sourced nutrition numbers throughout.

## What it does

1. **Practitioner builds a plan** — compose meals from a food/recipe library, see live nutrient totals as items are added.
2. **Practitioner assigns it to a client** — the plan's nutrient totals are snapshotted at that moment, so a later correction to the underlying food database never silently rewrites a plan a client has already received.
3. **Client logs compliance** — marks planned meals as eaten, logs substitutions, tracks weight and other measurements over time.
4. **Practitioner reviews progress** — a dashboard shows roster-wide compliance, and planned-vs-actual nutrition for any client.

## Why the numbers can be trusted

Nutrient data comes from USDA FoodData Central (public domain, authoritative), normalized and cached locally. All nutrient arithmetic runs through a single, pure, exhaustively-tested calculation engine (`NutrientCalculator`) using integer arithmetic throughout — never floating-point — specifically so totals are deterministic and reproducible, not just "close enough." Every practitioner supplies their own free USDA API key, so no install's usage competes with another's for rate limits.

## Architecture

Built on [WPSprout](https://github.com/lihsaa591/wpsprout), a DI-container-based plugin framework: service providers, versioned migrations, a capability-gated-by-default REST API, and a React admin UI. Custom database tables (not post types) back every domain object — clients, foods, recipes, plans, log entries, measurements — since this is transactional data queried by criteria post types don't index well.

## Development

```bash
composer install
npm install
npm run build      # or: npm start, for watch mode
```

To use `npm start`'s hot reload, add this to the WordPress install's
`wp-config.php` (before `NUTRIO_DEVELOPMENT` is otherwise defined —
i.e. before the line that loads plugins) — it defaults to `false`,
regardless of `WP_DEBUG`, so the plugin never tries to load its JS
from a dev server that isn't running:

```php
define( 'NUTRIO_DEVELOPMENT', true );
```

Then point `wp-env` (or a local WordPress install) at this directory as a plugin:

```bash
npx wp-env start
```

### Accessibility scans

`npm run test:e2e:a11y` starts wp-env, seeds a practitioner/client/plan
fixture, and runs axe-core against 8 core admin and client-portal
screens (see `tests/e2e/`). It is run locally only, not in CI — see
`docs/superpowers/specs/2026-09-26-accessibility-testing-design.md`
for the full design and what's deliberately out of scope for this
first pass. This wp-env instance is dedicated to automated testing;
NUTRIO_DEVELOPMENT is forced off here so the plugin loads from the
built files rather than a phantom dev server. Day-to-day interactive
development with hot reload happens against a separate WordPress
install. Open `playwright-report/index.html` after a local run for
full per-violation detail.

## Requirements

- PHP 8.1+
- WordPress 6.9+
- A free [USDA FoodData Central API key](https://fdc.nal.usda.gov/api-key-signup.html) (per-practitioner, entered in plugin settings)

## Status

Pre-release (0.1.x), being prepared for submission to the WordPress.org plugin directory.

## License

GPL-2.0-or-later. See [LICENSE](LICENSE).
