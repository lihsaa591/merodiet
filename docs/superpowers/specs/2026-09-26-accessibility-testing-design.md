# Accessibility Testing — Design Spec

## Context

Nutrio has no automated accessibility testing today. `ci.yml` runs
phpcs, phpstan, phpunit, lint-js, and a production build, but nothing
checks that the admin app or the client portal are usable with
assistive technology. The product plan's Phase 6 (release readiness)
names WCAG 2.2 AA as a goal; this spec covers a smaller, immediately
actionable first step: automated structural/contrast/ARIA scanning via
axe-core, run against real pages in CI, non-blocking until the initial
findings are triaged.

This is scoped as its own project: it introduces new tooling
(Playwright, wp-env orchestration in CI, axe-core) and a new CI job,
none of which exist in the repo yet.

## Goals

- Catch structural accessibility regressions (missing landmarks, bad
  heading order, missing form labels, insufficient contrast, ARIA
  misuse) automatically, on every PR.
- Cover the core practitioner and client flows first: 3 admin screens,
  5 client-portal screens.
- Make the first run's findings visible (CI job summary + downloadable
  HTML report) without blocking any PR on a backlog of pre-existing
  issues nobody has triaged yet.
- Target WCAG 2.1 AA (axe tags: `wcag2a`, `wcag2aa`, `wcag21a`,
  `wcag21aa`).

## Non-goals

- Not asserting/failing the build on violations yet. Flipping this
  job to blocking is a separate, future decision once the initial
  backlog is triaged.
- Not covering every admin screen or every modal/drawer (Recipe
  Builder, Food Search, AssignModal, ProfileDrawer, Settings, etc.) —
  only the 8 core-flow screens listed below. Expanding coverage is a
  follow-up.
- Not a substitute for manual keyboard-only navigation testing or
  screen-reader testing — axe-core catches a meaningful subset of
  WCAG success criteria (missing labels, contrast, landmark/heading
  structure, ARIA misuse) but not everything a human pass would catch
  (logical focus order across a full task, screen-reader announcement
  quality). Manual passes remain a separate activity.
- Not touching `wp-login.php` (WordPress core's own login screen) —
  out of Nutrio's control to fix, so scanning it provides no
  actionable signal for this project.

## Architecture

### Tooling

New devDependencies:
- `@playwright/test` — test runner and browser automation.
- `@wordpress/e2e-test-utils-playwright` — the official WordPress
  package providing wp-env-aware Playwright fixtures: an authenticated
  `admin` page fixture (skips re-implementing wp-admin login), and
  `requestUtils` for seeding data via the REST API / WP-CLI without
  hand-rolling HTTP calls. Chosen over a hand-rolled wp-env + login
  harness because it already solves this exact problem and is
  maintained by WordPress core itself.
- `@axe-core/playwright` — runs axe-core against a loaded Playwright
  page and returns a structured violations list.

Runs against the existing `.wp-env.json` config (already present at
the repo root, currently used only for local dev / the PHP test
suite) — no new environment definition needed, just a consumer of it
in CI.

### Directory structure

```
tests/e2e/
  playwright.config.ts       — baseURL (wp-env's local port), projects, reporters
  global-setup.ts            — seeds practitioner + client + plan via requestUtils/WP-CLI
  fixtures/
    client-portal.ts         — custom fixture: logs in as the seeded client via the portal login form, returns an authenticated page
  helpers/
    axe-scan.ts              — shared helper: new AxeBuilder(page).withTags([...]).analyze(), returns violations + writes them into the HTML report via test.info().attach()
  specs/
    admin-dashboard.a11y.spec.ts
    admin-roster.a11y.spec.ts
    admin-plan-builder.a11y.spec.ts
    portal-login.a11y.spec.ts
    portal-dashboard.a11y.spec.ts
    portal-plan.a11y.spec.ts
    portal-log.a11y.spec.ts
    portal-measurements.a11y.spec.ts
```

Each spec: navigate to the screen (using the `admin` fixture for admin
screens, the custom `client-portal` fixture for portal screens), wait
for a screen-specific stable selector (e.g. the screen's `<h1>` or a
known data-loaded element) so the scan runs against fully-rendered
content, then call the shared `axe-scan` helper.

`global-setup.ts` is registered as Playwright's own `globalSetup`
option in `playwright.config.ts` (not a separate CI/npm-script step),
so it always runs exactly once before the suite in every environment —
local or CI — with no duplicated invocation to keep in sync.

### Seed data (`global-setup.ts`)

Runs once before the suite, via `requestUtils`/WP-CLI against the
running wp-env instance:
- Reuses wp-env's default admin user for the practitioner-facing
  screens (no separate practitioner account needed for this scope).
- Creates one client user + client record (name, email, no PII beyond
  what the app itself requires).
- Assigns that client a plan with one day containing at least one meal
  item, so Plan/Log/Measurements render populated states rather than
  empty-state screens — a populated screen has more surface area for
  axe to check (data tables, item lists, badges) than an empty one.
- Logs one measurement entry for the client, so the Measurements
  screen's history list isn't empty either.

### Auth

- Admin screens: `@wordpress/e2e-test-utils-playwright`'s built-in
  `admin` fixture (already logged in as wp-env's default admin).
- Client-portal screens: a small custom fixture
  (`fixtures/client-portal.ts`) that submits the portal's own login
  form (`POST` to `/client-portal/` with the seeded client's
  credentials) and returns a logged-in `page`, since the official
  package's `admin` fixture is wp-admin-specific and doesn't know
  about Nutrio's separate client-portal login.

### Screens covered (8, "core flows" scope)

**Admin:**
1. Dashboard
2. Client roster
3. Plan Builder

**Client portal:**
4. Portal login page
5. Dashboard
6. Plan tab
7. Log tab
8. Measurements tab

### CI job

New job in `.github/workflows/ci.yml`:

```yaml
  a11y:
    runs-on: ubuntu-latest
    needs: [ build ]
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx wp-env start
      - run: npx playwright test tests/e2e       # globalSetup (wp-env seeding) runs automatically
        continue-on-error: true                  # non-blocking per current scope
      - name: Summarize a11y findings
        if: always()
        run: node tests/e2e/helpers/summarize-report.js >> "$GITHUB_STEP_SUMMARY"
      - uses: actions/upload-artifact@v7
        if: always()
        with:
          name: a11y-report
          path: playwright-report/
```

`continue-on-error: true` on the Playwright step only — the job still
reports its own status accurately (visible as a non-red but flagged
step), and the summary step always runs so violations are visible
without needing to open the workflow logs. A genuine crash (e.g. wp-env
failing to start, a fixture throwing before any scan runs) still shows
up clearly in that step's log even though it doesn't block the PR.

### Reporting

`helpers/summarize-report.js` reads the Playwright JSON report
(`--reporter=json` alongside `html`) and prints a Markdown table to
the job summary: one row per screen, with violation count and the top
rule IDs (e.g. `color-contrast: 3, label: 1`). The full HTML report
(with per-violation detail, affected selectors, and screenshots) is
the uploaded artifact for anyone who wants to dig in.

### Local usage

New `package.json` script: `"test:e2e:a11y": "wp-env start && playwright test tests/e2e"`.
A short section in the project README documents this.

## Testing this feature itself

Since this *is* the testing infrastructure, "testing it" means
verifying the harness works correctly before trusting its output:

1. Run `npm run test:e2e:a11y` locally against a clean wp-env instance
   and confirm all 8 specs execute (not skipped, not erroring on
   selector timeouts).
2. Temporarily introduce a known violation (e.g. remove an `alt`
   attribute from an image, or drop a form label) on one screen,
   confirm the corresponding spec's axe scan reports it, then revert.
3. Confirm the CI job's summary table renders correctly in a real PR
   (a draft PR is fine) and that the job does not fail the required
   checks despite violations being present.
4. Confirm the uploaded HTML report artifact opens and shows
   per-violation detail.

## Future decisions (explicitly deferred, not part of this plan)

- When/how to flip the job from non-blocking to blocking once the
  initial backlog is triaged.
- Whether to expand screen coverage beyond the 8 core-flow screens.
- Whether to add manual keyboard-navigation / screen-reader test
  procedures alongside the automated scans.
