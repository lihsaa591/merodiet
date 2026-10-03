import { test, expect } from '../fixtures/client-portal';

test.describe( 'portal log tab', () => {
	test.beforeEach( async ( { clientPage } ) => {
		await clientPage.goto( '/client-portal/?view=log' );
		await expect( clientPage.locator( '.nutrio-topbar h1' ) ).toBeVisible();
	} );

	test( 'shows the kcal summary and updates it when an item is marked eaten', async ( {
		clientPage,
	} ) => {
		const summary = clientPage.getByText( /of [\d.]+ kcal eaten today/ );
		await expect( summary ).toBeVisible();

		const markEaten = clientPage
			.getByRole( 'button', { name: 'Mark eaten' } )
			.first();

		// Seeded data persists across local runs — only act if something
		// is still unlogged.
		if ( await markEaten.isVisible() ) {
			await markEaten.click();
			await expect(
				clientPage
					.getByRole( 'status' )
					.filter( { hasText: 'Logged.' } )
			).toBeVisible();
		}

		// Whatever was eaten (this run or an earlier one), the total is
		// no longer 0.
		await expect( summary ).toHaveText( /^[1-9][\d.]* of / );
	} );

	test( 'history shows an empty message and no Load more when nothing older exists', async ( {
		clientPage,
	} ) => {
		await expect(
			clientPage.getByRole( 'heading', { name: 'Recent history' } )
		).toBeVisible();
		await expect(
			clientPage.getByText( 'Nothing logged yet.' )
		).toBeVisible();
		await expect(
			clientPage.getByRole( 'button', { name: 'Load more' } )
		).toHaveCount( 0 );
		await expect(
			clientPage.getByRole( 'button', { name: 'Show less' } )
		).toHaveCount( 0 );
	} );

	test( 'section headings keep their bottom margin', async ( {
		clientPage,
	} ) => {
		// Regression guard: a global `h3 { margin: 0 }` once beat the
		// module classes, gluing headings to the content under them.
		const heading = clientPage.getByRole( 'heading', {
			name: 'Recent history',
		} );
		const margin = await heading.evaluate(
			( el ) => getComputedStyle( el ).marginBottom
		);

		expect( margin ).not.toBe( '0px' );
	} );
} );
