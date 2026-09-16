import type { Plan } from '../../types';

interface State {
	byId: Record< number, Plan >;
	pages: Record< number, number[] >;
	total: number;
	totalPages: number;
}

export function getPlansPage( state: State, page: number ): Plan[] {
	return ( state.pages[ page ] ?? [] ).map( ( id ) => state.byId[ id ] );
}

export function getPlansTotalPages( state: State ): number {
	return state.totalPages;
}

export function getPlan( state: State, id: number ): Plan | null {
	return state.byId[ id ] ?? null;
}
