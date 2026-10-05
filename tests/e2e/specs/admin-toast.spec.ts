import { test, expect } from '../fixtures/admin-session';

test( 'saving the email sender with nothing changed says so in a toast', async ( {
	adminPage,
} ) => {
	await adminPage.goto( '/wp-admin/admin.php?page=merodiet&view=settings' );
	await adminPage.waitForLoadState( 'networkidle' );
	await adminPage
		.getByRole( 'button', { name: 'Email', exact: true } )
		.click();

	const senderForm = adminPage.locator( 'form', {
		has: adminPage.locator( '#merodiet-email-from-name' ),
	} );
	await expect( senderForm ).toBeVisible();

	await senderForm.getByRole( 'button', { name: 'Save' } ).click();

	await expect(
		adminPage
			.getByRole( 'status' )
			.filter( { hasText: 'No changes to save.' } )
	).toBeVisible();
} );
