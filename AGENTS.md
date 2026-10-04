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
- JS: `npm run build`, `npm run start`, `npm run lint:js`, `npm run check-types`, `npm run format`, `npm run test:unit`, `npm run test:e2e:a11y`, `npm run make-pot` (builds, then regenerates `languages/nutrio.pot`; needs WP-CLI; run before each release)
- PHP: `composer run test`, `composer run phpcs`, `composer run phpcbf`, `composer run phpstan`

## Conventions
- PHP: PascalCase, one class per file, WordPress Coding Standards (phpcs). REST controllers extend `AbstractController`, `AbstractPractitionerController` or `AbstractClientController`. Access is gated by the `practitioner` and `nutrition_client` roles (`RoleRegistrar`).
- State: `@wordpress/data` stores in `src/store/*`; fetching via `@wordpress/api-fetch` (portal uses `nonceMiddleware.ts`).
- Routing: no router lib; `src/hooks/useQueryParam.ts` switches screens via URL query params.
- Styling: `src/styles/tokens.css`, `base.css`; CSS modules (`*.module.css`) in the client portal.
- i18n: `@wordpress/i18n`. Components PascalCase, hooks `useX`, utils camelCase.
- Keep a11y passing (axe tests; run locally with `npm run test:e2e:a11y`, not in CI).

## Working rules
- Run only the relevant check (single test file / `check-types`), not the full suite, and avoid dumping long logs.
- Prefer targeted edits over rewriting files.
- Filter command output at the source (`| tail -n 20`, `grep -E`, `--reporter=line`); never print whole logs, HTML pages, CSS or JSON responses. For HTTP checks, grep the one thing needed.
- Read files with `offset`/`limit` or grep first; don't read a whole large file for one function.
- Delegate broad "where is X" searches to the `explore` subagent instead of chaining greps in the main session.
- Batch independent tool calls in one message; don't re-run a check that already passed unless files changed.
- Edit scripts: assert each replacement matches exactly once, so a miss fails fast instead of needing a redo.
- One task per branch/PR; after a PR merges, suggest starting a fresh session (context grows every turn).
- Use plain `curl`/`wp eval` for quick local checks (wp-cli needs the Local socket + PHP 8.x); don't hand-debug through the browser.
