import { pageKey } from './reducer';
import type { CustomFood } from '../../types';

interface State {
	byId: Record< number, CustomFood >;
	allIds: number[];
	pages: Record< string, number[] >;
	total: number;
	totalPages: number;
}

// Every custom food fetched via the "give me everything" path — see getCustomFoods()'s docblock.
export function getCustomFoods( state: State ): CustomFood[] {
	return state.allIds.map( ( id ) => state.byId[ id ] );
}

export function getCustomFoodsPage(
	state: State,
	page: number,
	perPage: number = 10,
	filters: Record< string, string > = {}
): CustomFood[] {
	return ( state.pages[ pageKey( page, perPage, filters ) ] ?? [] ).map(
		( id ) => state.byId[ id ]
	);
}

export function getCustomFoodsTotal( state: State ): number {
	return state.total;
}

export function getCustomFoodsTotalPages( state: State ): number {
	return state.totalPages;
}
