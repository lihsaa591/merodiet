import { defineConfig } from '@playwright/test';

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
