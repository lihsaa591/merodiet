import type { Client } from '../../types';

/**
 * Clients live keyed by id, so a single-item update never requires
 * touching the rest of the list.
 */
interface State {
	byId: Record< number, Client >;
	allIds: number[];
}

const DEFAULT_STATE: State = {
	byId: {},
	allIds: [],
};

type Action =
	| { type: 'RECEIVE_CLIENTS'; clients: Client[] }
	| { type: 'RECEIVE_CLIENT'; client: Client }
	| { type: 'REMOVE_CLIENT'; id: number };

export default function reducer( state: State = DEFAULT_STATE, action: Action ): State {
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

			return { byId, allIds };
		}

		case 'RECEIVE_CLIENT': {
			const exists = Boolean( state.byId[ action.client.id ] );

			return {
				byId: { ...state.byId, [ action.client.id ]: action.client },
				allIds: exists ? state.allIds : [ ...state.allIds, action.client.id ],
			};
		}

		case 'REMOVE_CLIENT': {
			const byId = { ...state.byId };
			delete byId[ action.id ];

			return {
				byId,
				allIds: state.allIds.filter( ( id ) => id !== action.id ),
			};
		}

		default:
			return state;
	}
}
