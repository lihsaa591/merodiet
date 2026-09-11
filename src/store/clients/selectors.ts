import type { Client } from '../../types';

interface State {
	byId: Record< number, Client >;
	allIds: number[];
}

export function getClients( state: State ): Client[] {
	return state.allIds.map( ( id ) => state.byId[ id ] );
}

export function getClient( state: State, id: number ): Client | null {
	return state.byId[ id ] ?? null;
}
