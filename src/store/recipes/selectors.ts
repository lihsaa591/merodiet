import type { Recipe } from '../../types';

interface State {
	byId: Record< number, Recipe >;
	allIds: number[];
	pages: Record< number, number[] >;
	total: number;
	totalPages: number;
}

// Every recipe fetched via the "give me everything" path — see getRecipes()'s docblock.
export function getRecipes( state: State ): Recipe[] {
	return state.allIds.map( ( id ) => state.byId[ id ] );
}

export function getRecipesPage( state: State, page: number ): Recipe[] {
	return ( state.pages[ page ] ?? [] ).map( ( id ) => state.byId[ id ] );
}

export function getRecipesTotal( state: State ): number {
	return state.total;
}

export function getRecipesTotalPages( state: State ): number {
	return state.totalPages;
}

export function getRecipe( state: State, id: number ): Recipe | null {
	return state.byId[ id ] ?? null;
}
