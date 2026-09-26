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

		// Wait for the wp-admin page to load
		await page.waitForURL( /wp-admin/, { timeout: 10000 } );
		await page.waitForLoadState( 'networkidle' );

		// eslint-disable-next-line react-hooks/rules-of-hooks -- this is Playwright's fixture `use()` callback, not a React hook.
		await use( page );
		await context.close();
	},
} );

export { expect };
