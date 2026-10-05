import { test, expect } from '../fixtures/client-portal';
import { ensureTodaysItemsEaten } from '../helpers/portal-api';

test.describe( 'portal plan and dashboard', () => {
	test( 'my plan shows recipe portion weight and the day total', async ( {
		clientPage,
	} ) => {
		await clientPage.goto( '/client-portal/?view=plan' );
		await expect(
			clientPage.locator( '.merodiet-topbar h1' )
		).toBeVisible();

		// Seeded recipe: 300 g across 2 servings, 1 serving planned.
		await expect( clientPage.getByText( '1 srv · 150 g' ) ).toBeVisible();

		await expect( clientPage.getByText( 'Day total' ) ).toBeVisible();
		// The first nutrient tile is Kcal (per-item kcal labels also match a
		// bare text query, so target the tile itself).
		await expect(
			clientPage.locator( '[class*="nutrientVal"]' ).first()
		).toHaveText( /^[1-9][\d.]* kcal$/ );
	} );

	test( "dashboard's today's plan shows status text, not a tick", async ( {
		clientPage,
	} ) => {
		await clientPage.goto( '/client-portal/?view=dashboard' );
		await expect( clientPage.locator( '.merodiet-rail' ) ).toBeVisible();
		await ensureTodaysItemsEaten( clientPage );
		await clientPage.reload();

		await expect( clientPage.getByText( 'Eaten' ).first() ).toBeVisible();
		await expect( clientPage.getByText( '✓' ) ).toHaveCount( 0 );
		await expect(
			clientPage.getByText( /Kcal eaten/ ).locator( '..' )
		).not.toContainText( '—' );
	} );
} );
