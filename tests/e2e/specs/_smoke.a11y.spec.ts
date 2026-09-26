import { test, expect } from '../fixtures/client-portal';
import { scanForA11yViolations } from '../helpers/axe-scan';

test( 'client portal dashboard loads and scans without throwing', async ( {
	clientPage,
}, testInfo ) => {
	await clientPage.goto( '/client-portal/?view=dashboard' );
	await expect( clientPage.locator( '.nutrio-rail' ) ).toBeVisible();

	await scanForA11yViolations( clientPage, 'smoke-dashboard', testInfo );
} );
