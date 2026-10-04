import { test, expect } from '../fixtures/client-portal';
import { scanForA11yViolations } from '../helpers/axe-scan';

test( 'client portal plan tab has no axe violations', async ( {
	clientPage,
}, testInfo ) => {
	await clientPage.goto( '/client-portal/?view=plan' );
	await expect( clientPage.locator( '.nutrio-topbar h1' ) ).toBeVisible();

	await scanForA11yViolations( clientPage, 'portal-plan', testInfo );
} );
