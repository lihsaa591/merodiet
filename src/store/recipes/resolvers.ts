import apiFetch from '@wordpress/api-fetch';
import type { PaginatedResponse, Recipe } from '../../types';

interface ThunkArgs {
	dispatch: {
		receiveRecipes: (
			recipes: Recipe[],
			total: number,
			totalPages: number
		) => void;
		receiveRecipesPage: (
			page: number,
			perPage: number,
			filters: Record< string, string >,
			recipes: Recipe[],
			total: number,
			totalPages: number
		) => void;
		receiveRecipe: ( recipe: Recipe ) => void;
	};
}

/**
 * Fetches up to 100 recipes (the backend's own per_page ceiling) — for
 * consumers that search/filter across the whole library client-side
 * (ItemSearch's "My Recipes" tab), not the paginated table view. Known
 * limit: a library past 100 recipes won't be fully searchable here —
 * not a concern at this app's realistic scale.
 */
export function getRecipes() {
	return async ( { dispatch }: ThunkArgs ) => {
		const response: PaginatedResponse< Recipe > = await apiFetch( {
			path: '/nutrio/v1/recipes?per_page=100',
		} );

		dispatch.receiveRecipes(
			response.items,
			response.total,
			response.total_pages
		);
	};
}

export function getRecipesPage(
	page: number,
	perPage: number = 10,
	filters: Record< string, string > = {}
) {
	return async ( { dispatch }: ThunkArgs ) => {
		const params = new URLSearchParams( {
			page: String( page ),
			per_page: String( perPage ),
			...filters,
		} );
		const response: PaginatedResponse< Recipe > = await apiFetch( {
			path: `/nutrio/v1/recipes?${ params.toString() }`,
		} );

		dispatch.receiveRecipesPage(
			page,
			perPage,
			filters,
			response.items,
			response.total,
			response.total_pages
		);
	};
}

export function getRecipe( id: number ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const recipe: Recipe = await apiFetch( {
			path: `/nutrio/v1/recipes/${ id }`,
		} );

		dispatch.receiveRecipe( recipe );
	};
}
