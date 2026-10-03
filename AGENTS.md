# Nutrio

WordPress plugin: PHP backend + React 18/TypeScript admin SPA and client portal. Uses the WordPress DB (custom migrations), no external backend.

## Layout
- `nutrio.php`, `uninstall.php`: entry points
- `includes/`: PHP (Admin, Clients, Contracts, Database, Email, Helper, Nutrition, Providers, Repositories, RestApi, Roles)
- `src/`: TS/React (`admin`, `client-portal`, `components`, `hooks`, `screens/<domain>`, `store`, `styles`, `utils`)
- `database/migrations/`: timestamped class migrations implementing `MigrationInterface`
- `tests/Unit` (PHPUnit), `tests/e2e` (Playwright + axe)
- `docs/superpowers/{plans,specs}`: old plans/specs; do not read unless asked
- `build/`, `vendor/`, `node_modules/`, `artifacts/`: generated, never edit

## Commands
- JS: `npm run build`, `npm run start`, `npm run lint:js`, `npm run check-types`, `npm run format`, `npm run test:unit`, `npm run test:e2e:a11y`
- PHP: `composer run test`, `composer run phpcs`, `composer run phpcbf`, `composer run phpstan`

## Conventions
- PHP: PascalCase, one class per file, WordPress Coding Standards (phpcs). REST controllers extend `AbstractController`, `AbstractPractitionerController` or `AbstractClientController`. Access is gated by the `practitioner` and `nutrition_client` roles (`RoleRegistrar`).
- State: `@wordpress/data` stores in `src/store/*`; fetching via `@wordpress/api-fetch` (portal uses `nonceMiddleware.ts`).
- Routing: no router lib; `src/hooks/useQueryParam.ts` switches screens via URL query params.
- Styling: `src/styles/tokens.css`, `base.css`; CSS modules (`*.module.css`) in the client portal.
- i18n: `@wordpress/i18n`. Components PascalCase, hooks `useX`, utils camelCase.
- Keep a11y passing (axe tests).

## Working rules
- Run only the relevant check (single test file / `check-types`), not the full suite, and avoid dumping long logs.
- Prefer targeted edits over rewriting files.
