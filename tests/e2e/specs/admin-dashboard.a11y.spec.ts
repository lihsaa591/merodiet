import { test, expect } from '../fixtures/admin-session';
import { scanForA11yViolations } from '../helpers/axe-scan';

test( 'admin dashboard has no axe violations', async ( {
	adminPage,
}, testInfo ) => {
	await adminPage.goto( '/wp-admin/admin.php?page=nutrio&view=dashboard' );
	await expect( adminPage.locator( '.nutrio-topbar h1' ) ).toBeVisible();

	await scanForA11yViolations( adminPage, 'admin-dashboard', testInfo );
} );
