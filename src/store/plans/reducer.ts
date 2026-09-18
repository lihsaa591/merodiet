import type { Plan } from '../../types';

/**
 * `pages` is keyed by pageKey(page, perPage, filters) rather than by page
 * number alone — otherwise page 1 under one filter/search combo would
 * silently overwrite page 1's cache for a different combo, and switching
 * back to the first combo would show the second's stale rows (see
 * src/store/clients/reducer.ts's docblock for the full reasoning).
 */
interface State {
	byId: Record< number, Plan >;
	pages: Record< string, number[] >;
	total: number;
	totalPages: number;
}

const DEFAULT_STATE: State = {
	byId: {},
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
			type: 'RECEIVE_PLANS_PAGE';
			page: number;
			perPage: number;
			filters: Record< string, string >;
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
					[ pageKey( action.page, action.perPage, action.filters ) ]:
						action.plans.map( ( plan ) => plan.id ),
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

			const pages: Record< string, number[] > = {};
			for ( const [ key, ids ] of Object.entries( state.pages ) ) {
				pages[ key ] = ids.filter( ( id ) => id !== action.id );
			}

			return { ...state, byId, pages };
		}

		default:
			return state;
	}
}
