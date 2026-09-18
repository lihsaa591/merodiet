import type { Client } from '../../types';

/**
 * `allIds` backs "give me every client" consumers (AssignModal's client
 * picker, the dashboard's client count) that need the full set, not one
 * page of it; `pages` backs the roster table's actual pagination. Both
 * are populated from the same paginated endpoint, just requested with a
 * different per_page.
 *
 * `pages` is keyed by pageKey(page, perPage, filters) rather than by page
 * number alone — otherwise page 1 under one filter/search combo would
 * silently overwrite page 1's cache for a different combo, and switching
 * back to the first combo would show the second's stale rows (since the
 * data module's resolver cache — keyed on the full args tuple — would
 * correctly avoid re-fetching, but the reducer's own storage wasn't
 * similarly filter-aware).
 */
interface State {
	byId: Record< number, Client >;
	allIds: number[];
	pages: Record< string, number[] >;
	total: number;
	totalPages: number;
}

const DEFAULT_STATE: State = {
	byId: {},
	allIds: [],
	pages: {},
	total: 0,
	totalPages: 1,
};

export function pageKey(
	page: number,
	perPage: number,
	filters: Record< string, string >
): string {
	const sorted = Object.entries( filters ).sort( ( [ a ], [ b ] ) =>
		a.localeCompare( b )
	);

	return `${ page }|${ perPage }|${ JSON.stringify( sorted ) }`;
}

type Action =
	| {
			type: 'RECEIVE_CLIENTS';
			clients: Client[];
			total: number;
			totalPages: number;
	  }
	| {
			type: 'RECEIVE_CLIENTS_PAGE';
			page: number;
			perPage: number;
			filters: Record< string, string >;
			clients: Client[];
			total: number;
			totalPages: number;
	  }
	| { type: 'RECEIVE_CLIENT'; client: Client }
	| { type: 'REMOVE_CLIENT'; id: number };

export default function reducer(
	state: State = DEFAULT_STATE,
	action: Action
): State {
	switch ( action.type ) {
		case 'RECEIVE_CLIENTS': {
			const byId = { ...state.byId };
			const allIds = [ ...state.allIds ];

			for ( const client of action.clients ) {
				if ( ! byId[ client.id ] ) {
					allIds.push( client.id );
				}
				byId[ client.id ] = client;
			}

			return {
				...state,
				byId,
				allIds,
				total: action.total,
				totalPages: action.totalPages,
			};
		}

		case 'RECEIVE_CLIENTS_PAGE': {
			const byId = { ...state.byId };

			for ( const client of action.clients ) {
				byId[ client.id ] = client;
			}

			return {
				...state,
				byId,
				pages: {
					...state.pages,
					[ pageKey( action.page, action.perPage, action.filters ) ]:
						action.clients.map( ( client ) => client.id ),
				},
				total: action.total,
				totalPages: action.totalPages,
			};
		}

		case 'RECEIVE_CLIENT': {
			const exists = Boolean( state.byId[ action.client.id ] );

			return {
				...state,
				byId: { ...state.byId, [ action.client.id ]: action.client },
				allIds: exists
					? state.allIds
					: [ ...state.allIds, action.client.id ],
			};
		}

		case 'REMOVE_CLIENT': {
			const byId = { ...state.byId };
			delete byId[ action.id ];

			const pages: Record< string, number[] > = {};
			for ( const [ key, ids ] of Object.entries( state.pages ) ) {
				pages[ key ] = ids.filter( ( id ) => id !== action.id );
			}

			return {
				...state,
				byId,
				pages,
				allIds: state.allIds.filter( ( id ) => id !== action.id ),
			};
		}

		default:
			return state;
	}
}
