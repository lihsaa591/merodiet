import { test, expect } from '@playwright/test';
import { scanForA11yViolations } from '../helpers/axe-scan';

test( 'client portal login screen has no axe violations', async ( {
	page,
}, testInfo ) => {
	await page.goto( '/client-portal/' );
	await expect( page.locator( '#loginform' ) ).toBeVisible();

	await scanForA11yViolations( page, 'portal-login', testInfo );
} );
