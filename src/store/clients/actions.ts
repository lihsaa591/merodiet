import apiFetch from '@wordpress/api-fetch';
import type { Client, ClientInput } from '../../types';

export function receiveClients(
	clients: Client[],
	total: number,
	totalPages: number
) {
	return { type: 'RECEIVE_CLIENTS' as const, clients, total, totalPages };
}

export function receiveClientsPage(
	page: number,
	perPage: number,
	filters: Record< string, string >,
	clients: Client[],
	total: number,
	totalPages: number
) {
	return {
		type: 'RECEIVE_CLIENTS_PAGE' as const,
		page,
		perPage,
		filters,
		clients,
		total,
		totalPages,
	};
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
		// Invalidates every cached resolution of a selector, regardless of
		// the args each was resolved with — the right tool here since
		// getClientsPage() is called with a (page, perPage) pair, and we
		// don't know which perPage the practitioner currently has active.
		// invalidateResolution(name, [exactArgs]) would only invalidate one
		// specific args tuple and silently miss the rest.
		invalidateResolutionForStoreSelector: ( selectorName: string ) => void;
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
		// Creating a client returns straight to the roster (unlike Recipes/
		// Plans, which navigate into an editor first) — page 1 needs to
		// reflect it immediately, so force it to actually re-fetch.
		dispatch.invalidateResolutionForStoreSelector( 'getClientsPage' );
		dispatch.invalidateResolutionForStoreSelector( 'getClients' );

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

export function inviteClient( id: number ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const client: Client = await apiFetch( {
			path: `/nutrio/v1/clients/${ id }/invite`,
			method: 'POST',
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
