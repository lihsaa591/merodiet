import apiFetch from '@wordpress/api-fetch';
import type { CustomFood, PaginatedResponse } from '../../types';

interface ThunkArgs {
	dispatch: {
		receiveCustomFoods: (
			foods: CustomFood[],
			total: number,
			totalPages: number
		) => void;
		receiveCustomFoodsPage: (
			page: number,
			foods: CustomFood[],
			total: number,
			totalPages: number
		) => void;
	};
}

/**
 * Fetches up to 100 custom foods (the backend's own per_page ceiling)
 * — for consumers that search/filter across the whole set client-side
 * (FoodSearch's "My custom foods" tab), not the paginated table view.
 * Known limit: a set past 100 custom foods won't be fully searchable
 * here — not a concern at this app's realistic scale.
 */
export function getCustomFoods() {
	return async ( { dispatch }: ThunkArgs ) => {
		const response: PaginatedResponse< CustomFood > = await apiFetch( {
			path: '/nutrio/v1/custom-foods?per_page=100',
		} );

		dispatch.receiveCustomFoods(
			response.items,
			response.total,
			response.total_pages
		);
	};
}

export function getCustomFoodsPage( page: number ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const response: PaginatedResponse< CustomFood > = await apiFetch( {
			path: `/nutrio/v1/custom-foods?page=${ page }&per_page=20`,
		} );

		dispatch.receiveCustomFoodsPage(
			page,
			response.items,
			response.total,
			response.total_pages
		);
	};
}
