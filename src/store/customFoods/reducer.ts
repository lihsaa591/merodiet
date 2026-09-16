import type { CustomFood } from '../../types';

/**
 * `allIds` backs "give me every custom food" consumers (FoodSearch's
 * "My custom foods" tab, which searches/filters client-side) that need
 * the full set, not one page of it; `pages` backs the Custom foods
 * screen's actual pagination. Both are populated from the same
 * paginated endpoint, just requested with a different per_page.
 */
interface State {
	byId: Record< number, CustomFood >;
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
			type: 'RECEIVE_CUSTOM_FOODS';
			foods: CustomFood[];
			total: number;
			totalPages: number;
	  }
	| {
			type: 'RECEIVE_CUSTOM_FOODS_PAGE';
			page: number;
			foods: CustomFood[];
			total: number;
			totalPages: number;
	  }
	| { type: 'RECEIVE_CUSTOM_FOOD'; food: CustomFood }
	| { type: 'REMOVE_CUSTOM_FOOD'; id: number };

export default function reducer(
	state: State = DEFAULT_STATE,
	action: Action
): State {
	switch ( action.type ) {
		case 'RECEIVE_CUSTOM_FOODS': {
			const byId = { ...state.byId };
			const allIds = [ ...state.allIds ];

			for ( const food of action.foods ) {
				if ( ! byId[ food.id ] ) {
					allIds.push( food.id );
				}
				byId[ food.id ] = food;
			}

			return {
				...state,
				byId,
				allIds,
				total: action.total,
				totalPages: action.totalPages,
			};
		}

		case 'RECEIVE_CUSTOM_FOODS_PAGE': {
			const byId = { ...state.byId };

			for ( const food of action.foods ) {
				byId[ food.id ] = food;
			}

			return {
				...state,
				byId,
				pages: {
					...state.pages,
					[ action.page ]: action.foods.map( ( food ) => food.id ),
				},
				total: action.total,
				totalPages: action.totalPages,
			};
		}

		case 'RECEIVE_CUSTOM_FOOD': {
			const exists = Boolean( state.byId[ action.food.id ] );

			return {
				...state,
				byId: { ...state.byId, [ action.food.id ]: action.food },
				allIds: exists
					? state.allIds
					: [ ...state.allIds, action.food.id ],
			};
		}

		case 'REMOVE_CUSTOM_FOOD': {
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
