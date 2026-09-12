import type { Recipe } from '../../types';

interface State {
	byId: Record< number, Recipe >;
	allIds: number[];
}

export function getRecipes( state: State ): Recipe[] {
	return state.allIds.map( ( id ) => state.byId[ id ] );
}

export function getRecipe( state: State, id: number ): Recipe | null {
	return state.byId[ id ] ?? null;
}
