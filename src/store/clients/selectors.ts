import { pageKey } from './reducer';
import type { Client } from '../../types';

interface State {
	byId: Record< number, Client >;
	allIds: number[];
	pages: Record< string, number[] >;
	total: number;
	totalPages: number;
}

// Every client fetched via the "give me everything" path — see getClients()'s docblock.
export function getClients( state: State ): Client[] {
	return state.allIds.map( ( id ) => state.byId[ id ] );
}

export function getClientsPage(
	state: State,
	page: number,
	perPage: number = 10,
	filters: Record< string, string > = {}
): Client[] {
	return ( state.pages[ pageKey( page, perPage, filters ) ] ?? [] ).map(
		( id ) => state.byId[ id ]
	);
}

export function getClientsTotal( state: State ): number {
	return state.total;
}

export function getClientsTotalPages( state: State ): number {
	return state.totalPages;
}

export function getClient( state: State, id: number ): Client | null {
	return state.byId[ id ] ?? null;
}
