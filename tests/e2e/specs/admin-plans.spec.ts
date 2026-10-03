import { test, expect } from '../fixtures/admin-session';

test( 'plans list names the assigned client and links to their detail page', async ( {
	adminPage,
} ) => {
	await adminPage.goto( '/wp-admin/admin.php?page=nutrio&view=plans' );
	await adminPage.waitForLoadState( 'networkidle' );

	const row = adminPage.getByRole( 'row', { name: /E2E Seed Plan/ } );
	await expect( row ).toBeVisible();
	await expect( row ).not.toContainText( 'Unassigned' );

	const link = row.getByRole( 'link', { name: 'E2E Client' } );
	await expect( link ).toBeVisible();
	await expect( link ).toHaveAttribute( 'href', /view=clients&id=\d+/ );

	// Regular weight, no underline.
	const style = await link.evaluate( ( el ) => {
		const computed = getComputedStyle( el );
		return {
			decoration: computed.textDecorationLine,
			weight: computed.fontWeight,
		};
	} );
	expect( style.decoration ).toBe( 'none' );
	expect( Number( style.weight ) ).toBeLessThan( 600 );

	await link.click();
	await expect( adminPage ).toHaveURL( /view=clients&id=\d+/ );
} );
