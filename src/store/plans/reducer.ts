import type { Plan } from '../../types';

interface State {
	byId: Record< number, Plan >;
	allIds: number[];
}

const DEFAULT_STATE: State = {
	byId: {},
	allIds: [],
};

type Action =
	| { type: 'RECEIVE_PLANS'; plans: Plan[] }
	| { type: 'RECEIVE_PLAN'; plan: Plan }
	| { type: 'REMOVE_PLAN'; id: number };

export default function reducer(
	state: State = DEFAULT_STATE,
	action: Action
): State {
	switch ( action.type ) {
		case 'RECEIVE_PLANS': {
			const byId = { ...state.byId };
			const allIds = [ ...state.allIds ];

			for ( const plan of action.plans ) {
				if ( ! byId[ plan.id ] ) {
					allIds.push( plan.id );
				}
				byId[ plan.id ] = plan;
			}

			return { byId, allIds };
		}

		case 'RECEIVE_PLAN': {
			const exists = Boolean( state.byId[ action.plan.id ] );

			return {
				byId: { ...state.byId, [ action.plan.id ]: action.plan },
				allIds: exists
					? state.allIds
					: [ ...state.allIds, action.plan.id ],
			};
		}

		case 'REMOVE_PLAN': {
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
