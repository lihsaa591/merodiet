import { test, expect } from '../fixtures/client-portal';
import { scanForA11yViolations } from '../helpers/axe-scan';

test( 'client portal dashboard has no axe violations', async ( {
	clientPage,
}, testInfo ) => {
	await clientPage.goto( '/client-portal/?view=dashboard' );
	await expect( clientPage.locator( '.merodiet-topbar h1' ) ).toBeVisible();

	await scanForA11yViolations( clientPage, 'portal-dashboard', testInfo );
} );
