import { defineConfig } from '@playwright/test';

export default defineConfig( {
	testDir: './tests/e2e/specs',
	globalSetup: './tests/e2e/global-setup.ts',
	fullyParallel: false,
	retries: 0,
	// Cap CI to a single worker: wp-env's login fixture doesn't tolerate
	// concurrent spec files hitting it at once (see task-6-report.md).
	workers: process.env.CI ? 1 : undefined,
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
