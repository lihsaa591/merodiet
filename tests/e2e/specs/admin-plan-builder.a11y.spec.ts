import { test, expect } from '../fixtures/admin-session';
import { scanForA11yViolations } from '../helpers/axe-scan';

test( 'admin plan builder has no axe violations', async ( {
	adminPage,
}, testInfo ) => {
	await adminPage.goto(
		'/wp-admin/admin.php?page=merodiet&view=plans&id=new'
	);
	await expect( adminPage.locator( '.merodiet-topbar h1' ) ).toBeVisible();

	await scanForA11yViolations( adminPage, 'admin-plan-builder', testInfo );
} );
