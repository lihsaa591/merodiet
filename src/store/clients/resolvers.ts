import apiFetch from '@wordpress/api-fetch';
import type { Client, PaginatedResponse } from '../../types';

interface ThunkArgs {
	dispatch: {
		receiveClients: (
			clients: Client[],
			total: number,
			totalPages: number
		) => void;
		receiveClientsPage: (
			page: number,
			perPage: number,
			filters: Record< string, string >,
			clients: Client[],
			total: number,
			totalPages: number
		) => void;
		receiveClient: ( client: Client ) => void;
	};
}

/**
 * Fetches up to 100 clients (the backend's own per_page ceiling) — for
 * consumers that need the whole roster to pick or count from (the
 * Assign-to-client dropdown, the dashboard's client count), not the
 * paginated table view. Known limit: a roster past 100 clients won't be
 * fully represented here — not a concern at this app's realistic scale.
 */
export function getClients() {
	return async ( { dispatch }: ThunkArgs ) => {
		const response: PaginatedResponse< Client > = await apiFetch( {
			path: '/merodiet/v1/clients?per_page=100',
		} );

		dispatch.receiveClients(
			response.items,
			response.total,
			response.total_pages
		);
	};
}

export function getClientsPage(
	page: number,
	perPage: number = 10,
	filters: Record< string, string > = {}
) {
	return async ( { dispatch }: ThunkArgs ) => {
		const params = new URLSearchParams( {
			page: String( page ),
			per_page: String( perPage ),
			...filters,
		} );
		const response: PaginatedResponse< Client > = await apiFetch( {
			path: `/merodiet/v1/clients?${ params.toString() }`,
		} );

		dispatch.receiveClientsPage(
			page,
			perPage,
			filters,
			response.items,
			response.total,
			response.total_pages
		);
	};
}

export function getClient( id: number ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const client: Client = await apiFetch( {
			path: `/merodiet/v1/clients/${ id }`,
		} );

		dispatch.receiveClient( client );
	};
}
