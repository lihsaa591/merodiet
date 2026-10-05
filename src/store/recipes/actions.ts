import apiFetch from '@wordpress/api-fetch';
import type { Recipe, RecipeInput } from '../../types';

export function receiveRecipes(
	recipes: Recipe[],
	total: number,
	totalPages: number
) {
	return { type: 'RECEIVE_RECIPES' as const, recipes, total, totalPages };
}

export function receiveRecipesPage(
	page: number,
	perPage: number,
	filters: Record< string, string >,
	recipes: Recipe[],
	total: number,
	totalPages: number
) {
	return {
		type: 'RECEIVE_RECIPES_PAGE' as const,
		page,
		perPage,
		filters,
		recipes,
		total,
		totalPages,
	};
}

export function receiveRecipe( recipe: Recipe ) {
	return { type: 'RECEIVE_RECIPE' as const, recipe };
}

export function removeRecipe( id: number ) {
	return { type: 'REMOVE_RECIPE' as const, id };
}

interface ThunkArgs {
	dispatch: {
		receiveRecipe: ( recipe: Recipe ) => void;
		removeRecipe: ( id: number ) => void;
		// Invalidates every cached resolution of a selector, regardless of
		// the args each was resolved with — the right tool here since
		// getRecipesPage() is called with a (page, perPage) pair, and we
		// don't know which perPage the practitioner currently has active.
		// invalidateResolution(name, [exactArgs]) would only invalidate one
		// specific args tuple and silently miss the rest.
		invalidateResolutionForStoreSelector: ( selectorName: string ) => void;
	};
}

// Thunks (not generators) — see src/store/clients/actions.ts for why.
export function createRecipe( data: RecipeInput ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const recipe: Recipe = await apiFetch( {
			path: '/merodiet/v1/recipes',
			method: 'POST',
			data,
		} );

		dispatch.receiveRecipe( recipe );
		dispatch.invalidateResolutionForStoreSelector( 'getRecipesPage' );
		dispatch.invalidateResolutionForStoreSelector( 'getRecipes' );

		return recipe;
	};
}

export function updateRecipe( id: number, data: Partial< RecipeInput > ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const recipe: Recipe = await apiFetch( {
			path: `/merodiet/v1/recipes/${ id }`,
			method: 'PATCH',
			data,
		} );

		dispatch.receiveRecipe( recipe );

		return recipe;
	};
}

export function deleteRecipe( id: number ) {
	return async ( { dispatch }: ThunkArgs ) => {
		await apiFetch( {
			path: `/merodiet/v1/recipes/${ id }`,
			method: 'DELETE',
		} );

		dispatch.removeRecipe( id );
	};
}
