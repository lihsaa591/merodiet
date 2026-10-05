import { test, expect } from '../fixtures/client-portal';
import { scanForA11yViolations } from '../helpers/axe-scan';

test( 'client portal log tab has no axe violations', async ( {
	clientPage,
}, testInfo ) => {
	await clientPage.goto( '/client-portal/?view=log' );
	await expect( clientPage.locator( '.merodiet-topbar h1' ) ).toBeVisible();

	await scanForA11yViolations( clientPage, 'portal-log', testInfo );
} );
