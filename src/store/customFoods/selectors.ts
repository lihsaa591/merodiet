import type { CustomFood } from '../../types';

interface State {
	byId: Record< number, CustomFood >;
	allIds: number[];
	pages: Record< number, number[] >;
	total: number;
	totalPages: number;
}

// Every custom food fetched via the "give me everything" path — see getCustomFoods()'s docblock.
export function getCustomFoods( state: State ): CustomFood[] {
	return state.allIds.map( ( id ) => state.byId[ id ] );
}

export function getCustomFoodsPage( state: State, page: number ): CustomFood[] {
	return ( state.pages[ page ] ?? [] ).map( ( id ) => state.byId[ id ] );
}

export function getCustomFoodsTotal( state: State ): number {
	return state.total;
}

export function getCustomFoodsTotalPages( state: State ): number {
	return state.totalPages;
}
