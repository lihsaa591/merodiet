import type { Recipe } from '../../types';

interface State {
	byId: Record< number, Recipe >;
	allIds: number[];
}

const DEFAULT_STATE: State = {
	byId: {},
	allIds: [],
};

type Action =
	| { type: 'RECEIVE_RECIPES'; recipes: Recipe[] }
	| { type: 'RECEIVE_RECIPE'; recipe: Recipe }
	| { type: 'REMOVE_RECIPE'; id: number };

export default function reducer( state: State = DEFAULT_STATE, action: Action ): State {
	switch ( action.type ) {
		case 'RECEIVE_RECIPES': {
			const byId = { ...state.byId };
			const allIds = [ ...state.allIds ];

			for ( const recipe of action.recipes ) {
				if ( ! byId[ recipe.id ] ) {
					allIds.push( recipe.id );
				}
				byId[ recipe.id ] = recipe;
			}

			return { byId, allIds };
		}

		case 'RECEIVE_RECIPE': {
			const exists = Boolean( state.byId[ action.recipe.id ] );

			return {
				byId: { ...state.byId, [ action.recipe.id ]: action.recipe },
				allIds: exists ? state.allIds : [ ...state.allIds, action.recipe.id ],
			};
		}

		case 'REMOVE_RECIPE': {
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
