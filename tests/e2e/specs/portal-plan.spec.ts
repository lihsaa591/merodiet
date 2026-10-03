import { test, expect } from '../fixtures/client-portal';
import { ensureTodaysItemsEaten } from '../helpers/portal-api';

test.describe( 'portal plan and dashboard', () => {
	test( 'my plan shows recipe portion weight and the day total', async ( {
		clientPage,
	} ) => {
		await clientPage.goto( '/client-portal/?view=plan' );
		await expect( clientPage.locator( '.nutrio-topbar h1' ) ).toBeVisible();

		// Seeded recipe: 300 g across 2 servings, 1 serving planned.
		await expect( clientPage.getByText( '1 srv · 150 g' ) ).toBeVisible();

		await expect( clientPage.getByText( 'Day total' ) ).toBeVisible();
		await expect( clientPage.getByText( /^[\d.]+ kcal$/ ) ).toBeVisible();
	} );

	test( "dashboard's today's plan shows status text, not a tick", async ( {
		clientPage,
	} ) => {
		await clientPage.goto( '/client-portal/?view=dashboard' );
		await expect( clientPage.locator( '.nutrio-rail' ) ).toBeVisible();
		await ensureTodaysItemsEaten( clientPage );
		await clientPage.reload();

		await expect( clientPage.getByText( 'Eaten' ).first() ).toBeVisible();
		await expect( clientPage.getByText( '✓' ) ).toHaveCount( 0 );
		await expect(
			clientPage.getByText( /Kcal eaten/ ).locator( '..' )
		).not.toContainText( '—' );
	} );
} );
