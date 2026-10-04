import { defineConfig } from '@playwright/test';

// @wordpress/e2e-test-utils-playwright defaults to wp-env's *tests* site
// (:8889), but this suite seeds and tests the dev site on :8888 (see
// baseURL below). Without this, a local run — where CI's WP_BASE_URL isn't
// set — retries logins against the wrong site forever and never starts.
process.env.WP_BASE_URL ??= 'http://localhost:8888';

export default defineConfig( {
	testDir: './tests/e2e/specs',
	globalSetup: './tests/e2e/global-setup.ts',
	fullyParallel: false,
	retries: 0,
	// Always a single worker: wp-env's login fixtures don't tolerate
	// concurrent spec files hitting the same instance at once — this
	// contention reproduces locally too, not just in CI (see
	// task-6-report.md and task-7-report.md).
	workers: 1,
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
