import apiFetch from '@wordpress/api-fetch';
import type { Recipe } from '../../types';

interface ThunkArgs {
	dispatch: {
		receiveRecipes: ( recipes: Recipe[] ) => void;
		receiveRecipe: ( recipe: Recipe ) => void;
	};
}

export function getRecipes() {
	return async ( { dispatch }: ThunkArgs ) => {
		const recipes: Recipe[] = await apiFetch( { path: '/nutrio/v1/recipes' } );

		dispatch.receiveRecipes( recipes );
	};
}

export function getRecipe( id: number ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const recipe: Recipe = await apiFetch( { path: `/nutrio/v1/recipes/${ id }` } );

		dispatch.receiveRecipe( recipe );
	};
}
