import { test, expect } from '../fixtures/client-portal';

test( 'portal theme choice persists across a reload', async ( {
	clientPage,
} ) => {
	await clientPage.goto( '/client-portal/?view=dashboard' );

	const html = clientPage.locator( 'html' );
	const toggle = clientPage.locator( '.merodiet-theme-toggle' );

	await toggle.click();
	const chosen = await html.getAttribute( 'data-theme' );
	expect( [ 'light', 'dark' ] ).toContain( chosen );

	await clientPage.reload();
	await expect( clientPage.locator( '.merodiet-rail' ) ).toBeVisible();
	await expect( html ).toHaveAttribute( 'data-theme', chosen as string );

	// Flip it back so a repeated local run (the seeded session's storage
	// is discarded, but be tidy anyway) starts from the same place.
	await toggle.click();
	await expect( html ).not.toHaveAttribute( 'data-theme', chosen as string );
} );
