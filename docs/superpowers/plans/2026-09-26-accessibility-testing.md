# Accessibility Testing Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automated accessibility (axe-core) scanning of 8 core Nutrio admin/client-portal screens via Playwright, running in a new non-blocking CI job.

**Architecture:** `@wordpress/e2e-test-utils-playwright` drives Playwright against the project's existing `.wp-env.json` instance, providing an authenticated-admin fixture and REST-seeding helpers out of the box. A small custom fixture adds client-portal login (the official package only knows wp-admin login). `@axe-core/playwright` scans each screen after it settles; a shared helper attaches results to the Playwright HTML report. A new `a11y` CI job runs the suite with `continue-on-error: true` and posts a violation summary to the job's GitHub Actions summary — visible, but never blocking a PR.

**Tech Stack:** `@playwright/test`, `@wordpress/e2e-test-utils-playwright`, `@axe-core/playwright`, the existing `wp-env` config, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-26-accessibility-testing-design.md`

## Global Constraints

- WCAG target: 2.1 AA — axe tags `[ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa' ]`, used on every scan.
- Non-blocking: the CI job must not fail a PR's required checks because of axe violations. Only the Playwright test-execution step gets `continue-on-error: true`; a wp-env startup failure or a fixture throwing before any scan runs must still be visible as a failed step.
- Exactly 8 screens this pass, no more: admin Dashboard, admin Client roster, admin Plan Builder (new-plan mode); client-portal login, Dashboard, Plan, Log, Measurements. `wp-login.php` is explicitly out of scope.
- Use `@wordpress/e2e-test-utils-playwright`'s built-in `admin` fixture and `requestUtils` for all admin-side seeding/auth — no hand-rolled wp-admin login or REST-auth code.
- `global-setup.ts` is registered as Playwright's own `globalSetup` config option — never invoked as a separate CI or npm-script step.
- Runs against the existing `.wp-env.json` at the repo root — no new environment config file.
- Local run command: `npm run test:e2e:a11y` → `wp-env start && playwright test tests/e2e`.

## Review Focus

- **wp-env not ready when Playwright's globalSetup starts:** a reasonable person expects the seed script to fail loudly with a clear error, not hang or silently seed against a dead server. Task 2 pins this with a assertion that the practitioner REST call actually succeeds (throws with the response body on non-2xx) before continuing.
- **global-setup run twice against the same wp-env instance (e.g. a developer re-running the suite without restarting wp-env):** a reasonable person expects a second run not to explode with a duplicate-email/duplicate-user error. Task 2's test covers running the setup script twice in a row and asserting the second run either no-ops or cleanly reuses the existing seed data.
- **Client-portal login fixture given wrong/stale credentials (e.g. seed didn't run, or ran against a different instance):** a reasonable person expects a clear failure message naming what went wrong, not a fixture that silently returns a logged-out page that then produces confusing downstream axe/selector failures. Task 3's test asserts the fixture throws a descriptive error when login fails.
- **`summarize-report.js` given a Playwright JSON report with zero violations across every screen:** a reasonable person expects a clean "no violations found" summary, not a crash from indexing into an empty array or a malformed table. Task 6's test covers a zero-violation fixture report.
- **CI's artifact-upload step running when `playwright-report/` was never created (e.g. `playwright test` itself failed to start):** a reasonable person expects the workflow to complete rather than fail an unrelated "artifact not found" error. Task 6 pins this with `if-no-files-found: warn` on the upload step.

---

### Task 1: Install tooling and scaffold Playwright config

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`
- Create: `tests/e2e/helpers/wp-cli.ts`

**Interfaces:**
- Produces: `runWpCli(command: string): string` in `tests/e2e/helpers/wp-cli.ts` — runs a WP-CLI command inside the wp-env container and returns trimmed stdout. Later tasks use this for the one thing REST can't do (inserting a locally-cached food row directly, bypassing the live USDA API).

- [ ] **Step 1: Add the new devDependencies**

Edit `package.json`'s `devDependencies` block to add:

```json
		"@axe-core/playwright": "^4.10.0",
		"@playwright/test": "^1.48.0",
		"@wordpress/e2e-test-utils-playwright": "^1.20.0",
```

- [ ] **Step 2: Add the local test script**

In `package.json`'s `scripts` block, add:

```json
		"test:e2e:a11y": "wp-env start && playwright test tests/e2e",
```

- [ ] **Step 3: Install and verify**

Run: `npm install`
Expected: installs cleanly, `node_modules/@playwright/test` and `node_modules/@wordpress/e2e-test-utils-playwright` exist.

Run: `npx playwright --version`
Expected: prints a Playwright version string.

- [ ] **Step 4: Write the WP-CLI helper**

Create `tests/e2e/helpers/wp-cli.ts`:

```typescript
import { execSync } from 'node:child_process';

/**
 * Runs a WP-CLI command inside the project's wp-env container and
 * returns its trimmed stdout. Throws (with wp-env's own error output)
 * if the command fails — callers should let that propagate rather
 * than swallow it, since a failed seed step must not silently
 * continue into a suite that then fails confusingly at the assertion
 * layer instead.
 */
export function runWpCli( command: string ): string {
	return execSync( `npx wp-env run cli -- wp ${ command }`, {
		encoding: 'utf8',
	} ).trim();
}
```

- [ ] **Step 5: Scaffold the Playwright config**

Create `playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig( {
	testDir: './tests/e2e/specs',
	globalSetup: './tests/e2e/global-setup.ts',
	fullyParallel: false,
	retries: 0,
	reporter: [
		[ 'html', { outputFolder: 'playwright-report', open: 'never' } ],
		[ 'json', { outputFile: 'playwright-report/results.json' } ],
		[ 'list' ],
	],
	use: {
		baseURL: 'http://localhost:8888',
		trace: 'retain-on-failure',
	},
} );
```

This references `./tests/e2e/global-setup.ts`, which doesn't exist yet — that's fine, it's created in Task 2. `baseURL` is wp-env's default local port for the `tests` environment WordPress instance (the same one `.wp-env.json` already configures).

- [ ] **Step 6: Verify the config loads**

Run: `npx playwright test --list tests/e2e`
Expected: fails with an error about `tests/e2e/global-setup.ts` not existing (not a config-parsing error) — confirms the config file itself is valid TypeScript Playwright can load.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json playwright.config.ts tests/e2e/helpers/wp-cli.ts
git commit -m "chore: add Playwright + axe-core tooling for a11y testing"
```

---

### Task 2: Seed data via a Playwright globalSetup script

**Files:**
- Create: `tests/e2e/global-setup.ts`
- Test: manual verification steps below (this task seeds a live wp-env instance; there is no unit-test harness for a globalSetup script itself — its own steps ARE its test)

**Interfaces:**
- Consumes: `runWpCli` from `tests/e2e/helpers/wp-cli.ts` (Task 1).
- Produces: after this script runs, the wp-env instance has: one client user (login `e2e-client`, password `E2eTest123!`, email `e2e-client@example.test`) with role `nutrition_client`, one Nutrio client record linked to that user via `user_id`, one plan assigned to that client covering today's date with one breakfast item, and one measurement logged for that client. Later tasks' specs rely on these existing so Plan/Log/Measurements/Dashboard render populated states.

- [ ] **Step 1: Confirm the target REST shapes exist**

Before writing the script, confirm the exact request bodies against the live controllers (these are already read from the codebase as of this plan, but re-verify nothing has changed):

Run: `grep -n "function create_client" -A 20 includes/RestApi/ClientsController.php`
Expected: confirms `create_client` reads `first_name`, `last_name`, `email`, `goals`, `dietary_restrictions`, `allergies`.

Run: `grep -n "function create_plan" -A 20 includes/RestApi/PlansController.php`
Expected: confirms `create_plan` reads `title`, `start_date`, `end_date`, `days` (an array of `{ day_offset, items: [{ meal_type, food_id, quantity_grams }] }`).

- [ ] **Step 2: Write the global setup script**

Create `tests/e2e/global-setup.ts`:

```typescript
import { chromium, request as playwrightRequest } from '@playwright/test';
import { RequestUtils } from '@wordpress/e2e-test-utils-playwright';
import { runWpCli } from './helpers/wp-cli';

const CLIENT_EMAIL = 'e2e-client@example.test';
const CLIENT_LOGIN = 'e2e-client';
const CLIENT_PASSWORD = 'E2eTest123!';
const SEED_FOOD_SOURCE_ID = 999999001;

async function globalSetup(): Promise< void > {
	const requestUtils = await RequestUtils.setup( {
		baseURL: 'http://localhost:8888',
	} );

	// Idempotency: if a previous run already seeded this client, skip
	// straight to done rather than erroring on a duplicate email/user.
	const existingUsers = await requestUtils.rest( {
		path: '/wp/v2/users',
		params: { search: CLIENT_EMAIL, context: 'edit' },
	} );

	if ( Array.isArray( existingUsers ) && existingUsers.length > 0 ) {
		return;
	}

	// 1. Insert one locally-cached food row directly via WP-CLI — this
	// is the one thing REST can't do standalone; the only food-creating
	// route resolves live against the USDA API, which would make this
	// seed step network-dependent and flaky in CI.
	const nowSql = new Date().toISOString().slice( 0, 19 ).replace( 'T', ' ' );
	const nutrientsJson = JSON.stringify( {
		'1008': { name: 'Energy', unit: 'kcal', amount_per_100g: 200 },
		'1003': { name: 'Protein', unit: 'g', amount_per_100g: 10 },
		'1005': { name: 'Carbohydrate', unit: 'g', amount_per_100g: 20 },
		'1004': { name: 'Total lipid (fat)', unit: 'g', amount_per_100g: 5 },
	} ).replace( /"/g, '\\"' );

	runWpCli(
		`db query "INSERT INTO wp_nutrio_foods (source, source_id, description, data_type, nutrients, source_synced_at, created_at, updated_at) VALUES ('usda', ${ SEED_FOOD_SOURCE_ID }, 'E2E Seed Oatmeal', 'Foundation', \\"${ nutrientsJson }\\", '${ nowSql }', '${ nowSql }', '${ nowSql }')"`
	);
	const foodId = runWpCli(
		`db query "SELECT id FROM wp_nutrio_foods WHERE source_id=${ SEED_FOOD_SOURCE_ID }" --skip-column-names`
	);

	// 2. Create the client record (as the practitioner — wp-env's default
	// admin already has every practitioner capability, see
	// includes/Roles/RoleRegistrar.php).
	const client = await requestUtils.rest( {
		path: '/nutrio/v1/clients',
		method: 'POST',
		data: {
			first_name: 'E2E',
			last_name: 'Client',
			email: CLIENT_EMAIL,
		},
	} );

	// 3. Invite — this creates the linked WP user (role nutrition_client)
	// and emails a random-password reset link we don't need.
	await requestUtils.rest( {
		path: `/nutrio/v1/clients/${ client.id }/invite`,
		method: 'POST',
	} );

	// 4. Find that just-created user and give it a known, deterministic
	// test password + login so the client-portal fixture can log in.
	const [ createdUser ] = await requestUtils.rest( {
		path: '/wp/v2/users',
		params: { search: CLIENT_EMAIL, context: 'edit' },
	} );

	await requestUtils.rest( {
		path: `/wp/v2/users/${ createdUser.id }`,
		method: 'POST',
		data: { username: CLIENT_LOGIN, password: CLIENT_PASSWORD },
	} );

	// 5. Assign a plan covering today, so Plan/Log/Dashboard render a
	// populated day instead of an empty state.
	const today = new Date().toISOString().slice( 0, 10 );
	const plan = await requestUtils.rest( {
		path: '/nutrio/v1/plans',
		method: 'POST',
		data: {
			title: 'E2E Seed Plan',
			start_date: today,
			end_date: today,
			days: [
				{
					day_offset: 0,
					items: [
						{
							meal_type: 'breakfast',
							food_id: Number( foodId ),
							quantity_grams: 150,
						},
					],
				},
			],
		},
	} );

	await requestUtils.rest( {
		path: `/nutrio/v1/plans/${ plan.id }/assign`,
		method: 'POST',
		data: { client_id: client.id, start_date: today, end_date: today },
	} );

	// 6. Log one measurement — /me/measurements is self-only, so this
	// needs an actual authenticated client-portal session, not the
	// admin-authenticated requestUtils above.
	const browser = await chromium.launch();
	const page = await browser.newPage();
	await page.goto( 'http://localhost:8888/client-portal/' );
	await page.fill( '#user_login', CLIENT_LOGIN );
	await page.fill( '#user_pass', CLIENT_PASSWORD );
	await page.click( '#wp-submit' );
	await page.waitForSelector( '.nutrio-rail' );

	const restNonce = await page.evaluate(
		() => ( window as unknown as { nutrioClientPortal: { restNonce: string } } )
			.nutrioClientPortal.restNonce
	);

	const clientRequest = await playwrightRequest.newContext( {
		baseURL: 'http://localhost:8888',
		storageState: await page.context().storageState(),
	} );

	await clientRequest.post( '/wp-json/nutrio/v1/me/measurements', {
		headers: { 'X-WP-Nonce': restNonce },
		data: { measured_at: today, weight_grams: 75000 },
	} );

	await clientRequest.dispose();
	await browser.close();
}

export default globalSetup;
```

- [ ] **Step 3: Start wp-env and run the seed manually**

Run: `npx wp-env start`
Expected: wp-env reports it's running at `http://localhost:8888`.

Run: `npx tsx tests/e2e/global-setup.ts` (or `npx ts-node` if `tsx` isn't already a devDependency — check `package.json`; if neither is present, add `tsx` as a devDependency first, since the CI job in Task 6 needs a way to run this standalone for verification, even though Playwright itself loads it as `globalSetup` directly)
Expected: exits with no error.

- [ ] **Step 4: Verify the seeded data**

Run:
```bash
npx wp-env run cli -- wp db query "SELECT email, user_id FROM wp_nutrio_clients WHERE email='e2e-client@example.test'"
```
Expected: one row, with a non-null `user_id`.

Run:
```bash
npx wp-env run cli -- wp db query "SELECT status FROM wp_nutrio_plans WHERE title='E2E Seed Plan'"
```
Expected: one row with `status = assigned`.

- [ ] **Step 5: Verify idempotency (Review Focus item)**

Run the same seed command again: `npx tsx tests/e2e/global-setup.ts`
Expected: exits with no error (the `existingUsers` check returns early), and re-running the client-count query from Step 4 still shows exactly one row, not two.

- [ ] **Step 6: Verify failure is loud when wp-env isn't running**

Run: `npx wp-env stop`, then `npx tsx tests/e2e/global-setup.ts`
Expected: throws a connection-refused style error pointing at `localhost:8888` — not a silent hang or a swallowed failure. Restart with `npx wp-env start` before continuing.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/global-setup.ts package.json package-lock.json
git commit -m "feat: seed practitioner/client/plan/measurement data for e2e a11y tests"
```

---

### Task 3: Client-portal login fixture and the shared axe-scan helper

**Files:**
- Create: `tests/e2e/fixtures/client-portal.ts`
- Create: `tests/e2e/helpers/axe-scan.ts`
- Create: `tests/e2e/specs/_smoke.a11y.spec.ts` (throwaway verification spec for this task only — deleted in Task 5's Step 1 once the real portal-login spec replaces it)

**Interfaces:**
- Consumes: seed data from Task 2 (`e2e-client` / `E2eTest123!`).
- Produces: `test` (a Playwright `test` function extended with a `clientPage` fixture) and `expect`, exported from `tests/e2e/fixtures/client-portal.ts`; `scanForA11yViolations( page: Page, screenName: string ): Promise<void>` exported from `tests/e2e/helpers/axe-scan.ts`, used by every spec in Tasks 4 and 5.

- [ ] **Step 1: Write the client-portal login fixture**

Create `tests/e2e/fixtures/client-portal.ts`:

```typescript
import { test as base, expect } from '@wordpress/e2e-test-utils-playwright';
import type { Page } from '@playwright/test';

const CLIENT_LOGIN = 'e2e-client';
const CLIENT_PASSWORD = 'E2eTest123!';

export const test = base.extend< { clientPage: Page } >( {
	clientPage: async ( { browser }, use ) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await page.goto( '/client-portal/' );
		await page.fill( '#user_login', CLIENT_LOGIN );
		await page.fill( '#user_pass', CLIENT_PASSWORD );
		await page.click( '#wp-submit' );

		const rail = page.locator( '.nutrio-rail' );

		try {
			await rail.waitFor( { timeout: 10000 } );
		} catch {
			throw new Error(
				'Client-portal login fixture failed: the sidebar (.nutrio-rail) never appeared after submitting the login form. ' +
					'Check that global-setup.ts has seeded the "e2e-client" user (see tests/e2e/global-setup.ts) and that wp-env is running.'
			);
		}

		await use( page );
		await context.close();
	},
} );

export { expect };
```

- [ ] **Step 2: Write the shared axe-scan helper**

Create `tests/e2e/helpers/axe-scan.ts`:

```typescript
import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';

const WCAG_TAGS = [ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa' ];

/**
 * Runs an axe-core scan against the current page and attaches the
 * full JSON result to the Playwright report under a name that
 * includes the screen — never throws on a violation (the CI job is
 * intentionally non-blocking; see the design spec), so callers don't
 * need their own try/catch around this.
 */
export async function scanForA11yViolations(
	page: Page,
	screenName: string,
	testInfo: TestInfo
): Promise< void > {
	const results = await new AxeBuilder( { page } )
		.withTags( WCAG_TAGS )
		.analyze();

	await testInfo.attach( `axe-${ screenName }`, {
		body: JSON.stringify( results.violations, null, 2 ),
		contentType: 'application/json',
	} );
}
```

- [ ] **Step 3: Write a throwaway smoke spec to verify both together**

Create `tests/e2e/specs/_smoke.a11y.spec.ts`:

```typescript
import { test, expect } from '../fixtures/client-portal';
import { scanForA11yViolations } from '../helpers/axe-scan';

test( 'client portal dashboard loads and scans without throwing', async ( {
	clientPage,
}, testInfo ) => {
	await clientPage.goto( '/client-portal/?view=dashboard' );
	await expect( clientPage.locator( '.nutrio-rail' ) ).toBeVisible();

	await scanForA11yViolations( clientPage, 'smoke-dashboard', testInfo );
} );
```

- [ ] **Step 4: Run it**

Run: `npx playwright test tests/e2e/specs/_smoke.a11y.spec.ts`
Expected: PASS (1 passed). Open `playwright-report/index.html` (`npx playwright show-report`) and confirm the test's attachments include an `axe-smoke-dashboard` JSON blob.

- [ ] **Step 5: Verify the fixture's failure message (Review Focus item)**

Temporarily edit `tests/e2e/fixtures/client-portal.ts`'s `CLIENT_PASSWORD` constant to a wrong value (e.g. `'WrongPassword!'`), run the smoke spec again.
Expected: FAILS with the descriptive error from Step 1 ("Client-portal login fixture failed: ..."), not a generic selector-timeout message.
Revert the password constant back to `'E2eTest123!'` afterward.

- [ ] **Step 6: Verify axe-scan actually detects a real violation**

An empty `violations` array in every run so far could mean either
"this screen is clean" or "the scanner is silently broken" — prove
it's the former by deliberately breaking something and checking the
scan reports it.

Temporarily edit `src/client-portal/DashboardTab.tsx`: find the
`<h1>` element rendering the greeting (inside the
`className="nutrio-topbar"` block) and wrap its text in an empty
`<span aria-hidden="true">` instead of rendering it as visible text,
e.g. temporarily change:

```tsx
<h1>
	{ greeting() } { greetingEmoji() }
</h1>
```

to:

```tsx
<h1>
	<span aria-hidden="true">{ greeting() } { greetingEmoji() }</span>
</h1>
```

This makes the heading's accessible name empty, which axe's
`empty-heading` rule flags.

Run: `npm run build` (rebuild the client-portal bundle so the change is served), then `npx playwright test tests/e2e/specs/_smoke.a11y.spec.ts`.
Expected: the test still PASSES (the axe-scan helper never throws — see its docblock), but its `axe-smoke-dashboard` attachment (view via `npx playwright show-report`) now contains one violation with `"id": "empty-heading"`.

Revert the `DashboardTab.tsx` change and rebuild: `npm run build`. Re-run the smoke spec once more and confirm the attachment is back to an empty `violations` array.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/fixtures/client-portal.ts tests/e2e/helpers/axe-scan.ts tests/e2e/specs/_smoke.a11y.spec.ts
git commit -m "feat: add client-portal login fixture and shared axe-scan helper"
```

---

### Task 4: Admin screen a11y specs

**Files:**
- Create: `tests/e2e/specs/admin-dashboard.a11y.spec.ts`
- Create: `tests/e2e/specs/admin-roster.a11y.spec.ts`
- Create: `tests/e2e/specs/admin-plan-builder.a11y.spec.ts`

**Interfaces:**
- Consumes: the `admin` fixture from `@wordpress/e2e-test-utils-playwright` (built-in, already-authenticated wp-admin page); `scanForA11yViolations` from Task 3.

- [ ] **Step 1: Dashboard spec**

Create `tests/e2e/specs/admin-dashboard.a11y.spec.ts`:

```typescript
import { test, expect } from '@wordpress/e2e-test-utils-playwright';
import { scanForA11yViolations } from '../helpers/axe-scan';

test( 'admin dashboard has no axe violations', async ( { admin, page }, testInfo ) => {
	await admin.visitAdminPage( 'admin.php', 'page=nutrio&view=dashboard' );
	await expect( page.locator( '.nutrio-topbar h1' ) ).toBeVisible();

	await scanForA11yViolations( page, 'admin-dashboard', testInfo );
} );
```

- [ ] **Step 2: Client roster spec**

Create `tests/e2e/specs/admin-roster.a11y.spec.ts`:

```typescript
import { test, expect } from '@wordpress/e2e-test-utils-playwright';
import { scanForA11yViolations } from '../helpers/axe-scan';

test( 'admin client roster has no axe violations', async ( { admin, page }, testInfo ) => {
	await admin.visitAdminPage( 'admin.php', 'page=nutrio&view=clients' );
	await expect( page.locator( '.nutrio-topbar h1' ) ).toBeVisible();

	await scanForA11yViolations( page, 'admin-roster', testInfo );
} );
```

- [ ] **Step 3: Plan Builder spec**

Create `tests/e2e/specs/admin-plan-builder.a11y.spec.ts`:

```typescript
import { test, expect } from '@wordpress/e2e-test-utils-playwright';
import { scanForA11yViolations } from '../helpers/axe-scan';

test( 'admin plan builder has no axe violations', async ( { admin, page }, testInfo ) => {
	await admin.visitAdminPage( 'admin.php', 'page=nutrio&view=plans&id=new' );
	await expect( page.locator( '.nutrio-topbar h1' ) ).toBeVisible();

	await scanForA11yViolations( page, 'admin-plan-builder', testInfo );
} );
```

- [ ] **Step 4: Run all three**

Run: `npx playwright test tests/e2e/specs/admin-dashboard.a11y.spec.ts tests/e2e/specs/admin-roster.a11y.spec.ts tests/e2e/specs/admin-plan-builder.a11y.spec.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/specs/admin-dashboard.a11y.spec.ts tests/e2e/specs/admin-roster.a11y.spec.ts tests/e2e/specs/admin-plan-builder.a11y.spec.ts
git commit -m "feat: add a11y specs for the 3 core admin screens"
```

---

### Task 5: Client-portal screen a11y specs

**Files:**
- Create: `tests/e2e/specs/portal-login.a11y.spec.ts`
- Create: `tests/e2e/specs/portal-dashboard.a11y.spec.ts`
- Create: `tests/e2e/specs/portal-plan.a11y.spec.ts`
- Create: `tests/e2e/specs/portal-log.a11y.spec.ts`
- Create: `tests/e2e/specs/portal-measurements.a11y.spec.ts`
- Delete: `tests/e2e/specs/_smoke.a11y.spec.ts` (Task 3's throwaway verification spec — superseded by `portal-dashboard.a11y.spec.ts` below)

**Interfaces:**
- Consumes: `test`/`expect` from `tests/e2e/fixtures/client-portal.ts` (Task 3, for the 4 logged-in screens) and plain `@playwright/test` (for the login screen, which by definition isn't logged in yet); `scanForA11yViolations` from Task 3.

- [ ] **Step 1: Delete the throwaway smoke spec**

```bash
git rm tests/e2e/specs/_smoke.a11y.spec.ts
```

- [ ] **Step 2: Login screen spec**

Create `tests/e2e/specs/portal-login.a11y.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { scanForA11yViolations } from '../helpers/axe-scan';

test( 'client portal login screen has no axe violations', async ( { page }, testInfo ) => {
	await page.goto( '/client-portal/' );
	await expect( page.locator( '#loginform' ) ).toBeVisible();

	await scanForA11yViolations( page, 'portal-login', testInfo );
} );
```

- [ ] **Step 3: Dashboard spec**

Create `tests/e2e/specs/portal-dashboard.a11y.spec.ts`:

```typescript
import { test, expect } from '../fixtures/client-portal';
import { scanForA11yViolations } from '../helpers/axe-scan';

test( 'client portal dashboard has no axe violations', async ( { clientPage }, testInfo ) => {
	await clientPage.goto( '/client-portal/?view=dashboard' );
	await expect( clientPage.locator( '.nutrio-topbar h1' ) ).toBeVisible();

	await scanForA11yViolations( clientPage, 'portal-dashboard', testInfo );
} );
```

- [ ] **Step 4: Plan spec**

Create `tests/e2e/specs/portal-plan.a11y.spec.ts`:

```typescript
import { test, expect } from '../fixtures/client-portal';
import { scanForA11yViolations } from '../helpers/axe-scan';

test( 'client portal plan tab has no axe violations', async ( { clientPage }, testInfo ) => {
	await clientPage.goto( '/client-portal/?view=plan' );
	await expect( clientPage.locator( '.nutrio-topbar h1' ) ).toBeVisible();

	await scanForA11yViolations( clientPage, 'portal-plan', testInfo );
} );
```

- [ ] **Step 5: Log spec**

Create `tests/e2e/specs/portal-log.a11y.spec.ts`:

```typescript
import { test, expect } from '../fixtures/client-portal';
import { scanForA11yViolations } from '../helpers/axe-scan';

test( 'client portal log tab has no axe violations', async ( { clientPage }, testInfo ) => {
	await clientPage.goto( '/client-portal/?view=log' );
	await expect( clientPage.locator( '.nutrio-topbar h1' ) ).toBeVisible();

	await scanForA11yViolations( clientPage, 'portal-log', testInfo );
} );
```

- [ ] **Step 6: Measurements spec**

Create `tests/e2e/specs/portal-measurements.a11y.spec.ts`:

```typescript
import { test, expect } from '../fixtures/client-portal';
import { scanForA11yViolations } from '../helpers/axe-scan';

test( 'client portal measurements tab has no axe violations', async ( { clientPage }, testInfo ) => {
	await clientPage.goto( '/client-portal/?view=measurements' );
	await expect( clientPage.locator( '.nutrio-topbar h1' ) ).toBeVisible();

	await scanForA11yViolations( clientPage, 'portal-measurements', testInfo );
} );
```

- [ ] **Step 7: Run the full suite**

Run: `npx playwright test tests/e2e`
Expected: 8 passed (3 admin + 5 portal).

- [ ] **Step 8: Commit**

```bash
git add tests/e2e/specs
git commit -m "feat: add a11y specs for the 5 core client-portal screens"
```

---

### Task 6: CI job, report summarizer, and non-blocking wiring

**Files:**
- Create: `tests/e2e/helpers/summarize-report.js`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `playwright-report/results.json` (Playwright's JSON reporter output, configured in Task 1's `playwright.config.ts`).
- Produces: a Markdown table printed to stdout, redirected into `$GITHUB_STEP_SUMMARY` by the CI job.

- [ ] **Step 1: Write the summarizer as a small, directly-testable function**

Create `tests/e2e/helpers/summarize-report.js`:

```javascript
#!/usr/bin/env node
const fs = require( 'node:fs' );

/**
 * Reads a Playwright JSON report and returns a Markdown table: one
 * row per test (screen), with its violation count and top rule IDs
 * pulled from the axe attachment each spec writes via
 * scanForA11yViolations(). Exported (not just run as a script) so
 * this task's own verification can call it directly against a fixture
 * file, rather than only observing it end-to-end through a real
 * Playwright run.
 */
function summarize( reportJson ) {
	const rows = [];

	for ( const suite of reportJson.suites ?? [] ) {
		for ( const spec of suite.specs ?? [] ) {
			for ( const test of spec.tests ?? [] ) {
				for ( const result of test.results ?? [] ) {
					const attachment = ( result.attachments ?? [] ).find(
						( a ) => a.name?.startsWith( 'axe-' )
					);

					if ( ! attachment ) {
						continue;
					}

					const violations = JSON.parse(
						fs.readFileSync( attachment.path, 'utf8' )
					);
					const ruleCounts = {};

					for ( const violation of violations ) {
						ruleCounts[ violation.id ] =
							( ruleCounts[ violation.id ] ?? 0 ) + 1;
					}

					const topRules = Object.entries( ruleCounts )
						.map( ( [ id, count ] ) => `${ id }: ${ count }` )
						.join( ', ' );

					rows.push( {
						screen: spec.title,
						count: violations.length,
						topRules: topRules || '—',
					} );
				}
			}
		}
	}

	if ( 0 === rows.length ) {
		return '## Accessibility scan\n\nNo scan attachments found in this report.\n';
	}

	const header = '## Accessibility scan\n\n| Screen | Violations | Top rules |\n| --- | --- | --- |\n';
	const body = rows
		.map( ( r ) => `| ${ r.screen } | ${ r.count } | ${ r.topRules } |` )
		.join( '\n' );

	return `${ header }${ body }\n`;
}

if ( require.main === module ) {
	const reportPath = process.argv[ 2 ] ?? 'playwright-report/results.json';
	const reportJson = JSON.parse( fs.readFileSync( reportPath, 'utf8' ) );
	process.stdout.write( summarize( reportJson ) );
}

module.exports = { summarize };
```

- [ ] **Step 2: Write a fixture report with zero violations and verify (Review Focus item)**

Create a scratch file (not committed) `/tmp/zero-violations-report.json`:

```json
{ "suites": [ { "specs": [ { "title": "portal-login has no axe violations", "tests": [ { "results": [ { "attachments": [] } ] } ] } ] } ] }
```

Run: `node tests/e2e/helpers/summarize-report.js /tmp/zero-violations-report.json`
Expected: prints `## Accessibility scan` followed by "No scan attachments found in this report." — no crash, no "Cannot read property of undefined".

- [ ] **Step 3: Verify against a real report**

Run: `npx playwright test tests/e2e` (from Task 5, all 8 specs should still pass), then:

Run: `node tests/e2e/helpers/summarize-report.js`
Expected: prints a Markdown table with 8 rows, each showing `0` violations (assuming the seeded screens are currently clean) or a real count with rule IDs if not — either is fine, this step just confirms the script runs against a real report without crashing.

- [ ] **Step 4: Add the CI job**

Edit `.github/workflows/ci.yml`, adding this job after the existing `build` job:

```yaml
  a11y:
    runs-on: ubuntu-latest
    needs: [ build ]
    steps:
      - uses: actions/checkout@v7
      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.1'
          tools: composer
      - uses: actions/setup-node@v7
        with:
          node-version: 20
          cache: npm
      - run: composer install --no-progress --prefer-dist
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx wp-env start
      - name: Run accessibility scans
        run: npx playwright test tests/e2e
        continue-on-error: true
      - name: Summarize accessibility findings
        if: always()
        run: node tests/e2e/helpers/summarize-report.js >> "$GITHUB_STEP_SUMMARY"
      - uses: actions/upload-artifact@v7
        if: always()
        with:
          name: a11y-report
          path: playwright-report/
          if-no-files-found: warn
```

`composer install` is needed here (not just `npm ci`) because wp-env's PHP-side plugin loading needs the project's own vendor autoload; every other job that runs against a live WP instance (`test-php`) does the same.

- [ ] **Step 5: Validate the workflow YAML**

Run: `npx --yes yaml-lint .github/workflows/ci.yml 2>&1 || python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml'))" `
Expected: no syntax errors reported. (Either command demonstrates the YAML parses; use whichever is available in your environment.)

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/helpers/summarize-report.js .github/workflows/ci.yml
git commit -m "ci: add non-blocking accessibility scan job with a report summary"
```

---

### Task 7: Local docs and final end-to-end verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-6 — this task's own step is the full-stack verification that they all work together.

- [ ] **Step 1: Add a README section**

Find the README's existing "Testing" or "Development" section (check with `grep -n "^## " README.md` and place this immediately after whichever existing testing-related heading is closest, keeping the same heading level) and add:

```markdown
### Accessibility scans

`npm run test:e2e:a11y` starts wp-env, seeds a practitioner/client/plan
fixture, and runs axe-core against 8 core admin and client-portal
screens (see `tests/e2e/`). Results are non-blocking in CI today — see
`docs/superpowers/specs/2026-09-26-accessibility-testing-design.md`
for the full design and what's deliberately out of scope for this
first pass. Open `playwright-report/index.html` after a local run for
full per-violation detail.
```

- [ ] **Step 2: Full local run from a clean state**

Run:
```bash
npx wp-env stop
npm run test:e2e:a11y
```
Expected: wp-env starts, `global-setup.ts` seeds the fixture data (first run — not the idempotent-skip path), all 8 specs pass, and `playwright-report/results.json` exists.

- [ ] **Step 3: Open and skim the HTML report**

Run: `npx playwright show-report`
Expected: opens in a browser; each of the 8 tests shows its `axe-<screen>` attachment, viewable as formatted JSON.

- [ ] **Step 4: Run the full pre-existing test suite to confirm nothing else broke**

Run: `npm run check-types && npx wp-scripts lint-js tests/e2e && npm run build`
Expected: all pass — the new `tests/e2e/` TypeScript files must type-check and lint cleanly alongside the rest of the project.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document the accessibility test suite"
```

- [ ] **Step 6: Push and confirm the CI job on a real PR**

Push this branch (`git push`) to whatever PR it's associated with (or
open one if none exists yet), then open that PR's checks in GitHub.

Expected: a new `a11y` job appears and completes (not necessarily
"green" in the sense of zero violations — per this plan's Global
Constraints, it must not block the PR's required checks either way).
Open the job's summary tab and confirm the Markdown violation table
from `summarize-report.js` renders there, and that the `a11y-report`
artifact is downloadable and contains the Playwright HTML report.

