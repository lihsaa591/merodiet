import apiFetch from '@wordpress/api-fetch';
import type { Client, ClientInput } from '../../types';

export function receiveClients( clients: Client[] ) {
	return { type: 'RECEIVE_CLIENTS' as const, clients };
}

export function receiveClient( client: Client ) {
	return { type: 'RECEIVE_CLIENT' as const, client };
}

export function removeClient( id: number ) {
	return { type: 'REMOVE_CLIENT' as const, id };
}

interface ThunkArgs {
	dispatch: {
		receiveClient: ( client: Client ) => void;
		removeClient: ( id: number ) => void;
	};
}

// Thunks (not generators) — this @wordpress/data version doesn't auto-dispatch
// a plain action object yielded from a generator, so mutations dispatch explicitly.
export function createClient( data: ClientInput ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const client: Client = await apiFetch( {
			path: '/nutrio/v1/clients',
			method: 'POST',
			data,
		} );

		dispatch.receiveClient( client );

		return client;
	};
}

export function updateClient( id: number, data: Partial< ClientInput > ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const client: Client = await apiFetch( {
			path: `/nutrio/v1/clients/${ id }`,
			method: 'PATCH',
			data,
		} );

		dispatch.receiveClient( client );

		return client;
	};
}

export function deleteClient( id: number ) {
	return async ( { dispatch }: ThunkArgs ) => {
		await apiFetch( {
			path: `/nutrio/v1/clients/${ id }`,
			method: 'DELETE',
		} );

		dispatch.removeClient( id );
	};
}
