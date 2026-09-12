import type { Plan } from '../../types';

interface State {
	byId: Record< number, Plan >;
	allIds: number[];
}

export function getPlans( state: State ): Plan[] {
	return state.allIds.map( ( id ) => state.byId[ id ] );
}

export function getPlan( state: State, id: number ): Plan | null {
	return state.byId[ id ] ?? null;
}
