import type { Plan } from '../../types';

interface State {
	byId: Record< number, Plan >;
	pages: Record< number, number[] >;
	total: number;
	totalPages: number;
}

const DEFAULT_STATE: State = {
	byId: {},
	pages: {},
	total: 0,
	totalPages: 1,
};

type Action =
	| {
			type: 'RECEIVE_PLANS_PAGE';
			page: number;
			plans: Plan[];
			total: number;
			totalPages: number;
	  }
	| { type: 'RECEIVE_PLAN'; plan: Plan }
	| { type: 'REMOVE_PLAN'; id: number };

export default function reducer(
	state: State = DEFAULT_STATE,
	action: Action
): State {
	switch ( action.type ) {
		case 'RECEIVE_PLANS_PAGE': {
			const byId = { ...state.byId };

			for ( const plan of action.plans ) {
				byId[ plan.id ] = plan;
			}

			return {
				byId,
				pages: {
					...state.pages,
					[ action.page ]: action.plans.map( ( plan ) => plan.id ),
				},
				total: action.total,
				totalPages: action.totalPages,
			};
		}

		case 'RECEIVE_PLAN': {
			return {
				...state,
				byId: { ...state.byId, [ action.plan.id ]: action.plan },
			};
		}

		case 'REMOVE_PLAN': {
			const byId = { ...state.byId };
			delete byId[ action.id ];

			const pages: Record< number, number[] > = {};
			for ( const [ page, ids ] of Object.entries( state.pages ) ) {
				pages[ Number( page ) ] = ids.filter(
					( id ) => id !== action.id
				);
			}

			return { ...state, byId, pages };
		}

		default:
			return state;
	}
}
