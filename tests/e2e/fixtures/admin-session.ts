import { test as base, expect } from '@wordpress/e2e-test-utils-playwright';
import type { Page } from '@playwright/test';

const ADMIN_LOGIN = 'admin';
const ADMIN_PASSWORD = 'password';

export const test = base.extend< { adminPage: Page } >( {
	adminPage: async ( { browser }, use ) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		await page.goto( '/wp-login.php' );
		await page.fill( '#user_login', ADMIN_LOGIN );
		await page.fill( '#user_pass', ADMIN_PASSWORD );
		await page.click( '#wp-submit' );

		// Wait for the wp-admin page to load — a CI runner's first cold
		// page load can comfortably exceed 10s (see client-portal.ts's
		// identical widening for the same reason).
		try {
			await page.waitForURL( /wp-admin/, { timeout: 30000 } );
		} catch {
			throw new Error(
				'Admin login fixture failed: never reached wp-admin after submitting the login form. ' +
					`Check that wp-env is running and the admin user exists with the expected credentials (login: "${ ADMIN_LOGIN }").`
			);
		}
		await page.waitForLoadState( 'networkidle' );

		await use( page );
		await context.close();
	},
} );

export { expect };
