import type { Page } from '@playwright/test';

/**
 * Marks every item on today's plan as eaten through the portal's own REST
 * API (authenticated by the page's session + nonce), skipping the ones
 * already logged — so specs that need "something eaten" stay idempotent
 * across repeated local runs, where the seeded data persists.
 *
 * @param page A page already logged in to the client portal.
 */
export async function ensureTodaysItemsEaten( page: Page ): Promise< void > {
	await page.evaluate( async () => {
		const nonce = (
			window as unknown as { merodietClientPortal: { restNonce: string } }
		 ).merodietClientPortal.restNonce;
		const headers = {
			'X-WP-Nonce': nonce,
			'Content-Type': 'application/json',
		};
		const today = new Date().toISOString().slice( 0, 10 );

		const plan = await (
			await fetch( '/wp-json/merodiet/v1/me/plan', { headers } )
		).json();
		const logs = await (
			await fetch(
				`/wp-json/merodiet/v1/me/logs?from=${ today }&to=${ today }`,
				{ headers }
			)
		).json();
		const logged = new Set< number >(
			logs.map(
				( entry: { plan_item_id: number | null } ) => entry.plan_item_id
			)
		);
		const start = new Date( plan.start_date + 'T00:00:00' );
		const now = new Date();
		now.setHours( 0, 0, 0, 0 );
		const offset = Math.floor(
			( now.getTime() - start.getTime() ) / 86400000
		);
		const day = plan.days.find(
			( d: { day_offset: number } ) => d.day_offset === offset
		);

		for ( const item of day?.items ?? [] ) {
			if ( logged.has( item.id ) ) {
				continue;
			}

			await fetch( '/wp-json/merodiet/v1/me/logs', {
				method: 'POST',
				headers,
				body: JSON.stringify( {
					plan_item_id: item.id,
					food_id: item.food_id ?? undefined,
					recipe_id: item.recipe_id ?? undefined,
					quantity_grams: item.quantity_grams ?? undefined,
					servings: item.servings ?? undefined,
					log_date: today,
					status: 'eaten',
				} ),
			} );
		}
	} );
}
