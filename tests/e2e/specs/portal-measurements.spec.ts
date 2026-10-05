import { test, expect } from '../fixtures/client-portal';

test.describe( 'portal measurements tab', () => {
	test.beforeEach( async ( { clientPage } ) => {
		await clientPage.goto( '/client-portal/?view=measurements' );
		await expect(
			clientPage.locator( '.merodiet-topbar h1' )
		).toBeVisible();
	} );

	test( 'lists the seeded weigh-in and offers no Load more when nothing is older', async ( {
		clientPage,
	} ) => {
		await expect(
			clientPage.getByText( 'No measurements logged yet.' )
		).toHaveCount( 0 );
		await expect(
			clientPage.getByRole( 'button', { name: 'Load more' } )
		).toHaveCount( 0 );
		await expect(
			clientPage.getByRole( 'button', { name: 'Show less' } )
		).toHaveCount( 0 );
	} );

	test( 'logging a weight confirms with a toast', async ( {
		clientPage,
	} ) => {
		await clientPage.fill( '#merodiet-weight-input', '74.5' );
		await clientPage.getByRole( 'button', { name: 'Log weight' } ).click();

		await expect(
			clientPage
				.getByRole( 'status' )
				.filter( { hasText: 'Measurement saved.' } )
		).toBeVisible();
	} );
} );
