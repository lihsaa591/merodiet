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
			// A CI runner's first cold page load (full SPA bundle fetch +
			// hydration) can comfortably exceed 10s — CI's own wp-env start
			// alone has been observed taking well over a minute, versus
			// seconds locally.
			await rail.waitFor( { timeout: 30000 } );
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
