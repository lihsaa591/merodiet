import apiFetch from '@wordpress/api-fetch';
import type { Client } from '../../types';

interface ThunkArgs {
	dispatch: {
		receiveClients: ( clients: Client[] ) => void;
		receiveClient: ( client: Client ) => void;
	};
}

// Runs once, automatically, the first time getClients()/getClient() is selected.
export function getClients() {
	return async ( { dispatch }: ThunkArgs ) => {
		const clients: Client[] = await apiFetch( { path: '/nutrio/v1/clients' } );

		dispatch.receiveClients( clients );
	};
}

export function getClient( id: number ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const client: Client = await apiFetch( { path: `/nutrio/v1/clients/${ id }` } );

		dispatch.receiveClient( client );
	};
}
