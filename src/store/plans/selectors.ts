import { pageKey } from './reducer';
import type { Plan } from '../../types';

interface State {
	byId: Record< number, Plan >;
	pages: Record< string, number[] >;
	total: number;
	totalPages: number;
}

export function getPlansPage(
	state: State,
	page: number,
	perPage: number = 10,
	filters: Record< string, string > = {}
): Plan[] {
	return ( state.pages[ pageKey( page, perPage, filters ) ] ?? [] ).map(
		( id ) => state.byId[ id ]
	);
}

export function getPlansTotal( state: State ): number {
	return state.total;
}

export function getPlansTotalPages( state: State ): number {
	return state.totalPages;
}

export function getPlan( state: State, id: number ): Plan | null {
	return state.byId[ id ] ?? null;
}
