import type { Recipe } from '../../types';

/**
 * `allIds` backs "give me every recipe" consumers (ItemSearch's "My
 * Recipes" tab, which searches/filters client-side) that need the full
 * set, not one page of it; `pages` backs the library table's actual
 * pagination. Both are populated from the same paginated endpoint, just
 * requested with a different per_page.
 *
 * `pages` is keyed by pageKey(page, perPage, filters) rather than by page
 * number alone — otherwise page 1 under one filter/search combo would
 * silently overwrite page 1's cache for a different combo, and switching
 * back to the first combo would show the second's stale rows (see
 * src/store/clients/reducer.ts's docblock for the full reasoning).
 */
interface State {
	byId: Record< number, Recipe >;
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
			type: 'RECEIVE_RECIPES';
			recipes: Recipe[];
			total: number;
			totalPages: number;
	  }
	| {
			type: 'RECEIVE_RECIPES_PAGE';
			page: number;
			perPage: number;
			filters: Record< string, string >;
			recipes: Recipe[];
			total: number;
			totalPages: number;
	  }
	| { type: 'RECEIVE_RECIPE'; recipe: Recipe }
	| { type: 'REMOVE_RECIPE'; id: number };

export default function reducer(
	state: State = DEFAULT_STATE,
	action: Action
): State {
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

			return {
				...state,
				byId,
				allIds,
				total: action.total,
				totalPages: action.totalPages,
			};
		}

		case 'RECEIVE_RECIPES_PAGE': {
			const byId = { ...state.byId };

			for ( const recipe of action.recipes ) {
				byId[ recipe.id ] = recipe;
			}

			return {
				...state,
				byId,
				pages: {
					...state.pages,
					[ pageKey( action.page, action.perPage, action.filters ) ]:
						action.recipes.map( ( recipe ) => recipe.id ),
				},
				total: action.total,
				totalPages: action.totalPages,
			};
		}

		case 'RECEIVE_RECIPE': {
			const exists = Boolean( state.byId[ action.recipe.id ] );

			return {
				...state,
				byId: { ...state.byId, [ action.recipe.id ]: action.recipe },
				allIds: exists
					? state.allIds
					: [ ...state.allIds, action.recipe.id ],
			};
		}

		case 'REMOVE_RECIPE': {
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
