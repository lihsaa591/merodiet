import type { Client } from '../../types';

/**
 * Clients live keyed by id, so a single-item update never requires
 * touching the rest of the list. `allIds` backs "give me every client"
 * consumers (the Assign-to-client picker, the dashboard's count) that
 * genuinely need the full set, not one page of it; `pages` backs the
 * roster table's actual pagination. Both are populated from the same
 * paginated endpoint, just requested with a different per_page.
 */
interface State {
	byId: Record< number, Client >;
	allIds: number[];
	pages: Record< number, number[] >;
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
					[ action.page ]: action.clients.map(
						( client ) => client.id
					),
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

			const pages: Record< number, number[] > = {};
			for ( const [ page, ids ] of Object.entries( state.pages ) ) {
				pages[ Number( page ) ] = ids.filter(
					( id ) => id !== action.id
				);
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
