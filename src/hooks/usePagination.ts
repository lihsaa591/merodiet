import { useEffect, useState } from '@wordpress/element';

interface ListState< F extends Record< string, string > > {
	page: number;
	perPage: number;
	filters: F;
}

interface UsePaginationOptions< F extends Record< string, string > > {
	defaultPerPage?: number;
	/** Every filter this screen supports, keyed by name, with its "unset" value (usually ''). Adding a new filter later is just adding a key here. */
	filterDefaults?: F;
}

interface UsePaginationResult< F extends Record< string, string > >
	extends ListState< F > {
	setPage: ( page: number ) => void;
	setPerPage: ( perPage: number ) => void;
	/** Updates one filter and resets to page 1, in a single combined URL update. */
	setFilter: ( key: keyof F, value: string ) => void;
}

const DEFAULT_PER_PAGE = 10;

// Page/per-page/filter state for one list screen, synced to the URL under
// screen-specific keys (e.g. `clients_page`, `clients_per_page`,
// `clients_filter_search`, `clients_filter_status`) — same deep-linkable/
// survives-refresh idea as useQueryParam, but for a group of values that
// change together (picking a new per-page size, or changing a filter, also
// resets the page to 1, in one combined URL update rather than several
// history entries). Namespaced per screen since every screen shares one URL
// under this app's own `?view=` switch — a bare `page`/`search` key would
// leak between Clients, Recipes, Plans, and Custom foods (see App.tsx's
// selectView(), which strips every `*_page`/`*_per_page`/`*_filter_*` key
// on every screen switch for the same reason).
//
// Filters are deliberately generic (an arbitrary string-keyed object, not a
// fixed `search`/`status` shape) so a screen can add a new filter later —
// e.g. a date range or a tag — by adding one entry to `filterDefaults`,
// with no change needed here.
export function usePagination<
	F extends Record< string, string > = Record< string, never >,
>(
	prefix: string,
	options: UsePaginationOptions< F > = {}
): UsePaginationResult< F > {
	const defaultPerPage = options.defaultPerPage ?? DEFAULT_PER_PAGE;
	const filterDefaults = options.filterDefaults ?? ( {} as F );

	const pageKey = `${ prefix }_page`;
	const perPageKey = `${ prefix }_per_page`;
	const filterKey = ( name: string ) => `${ prefix }_filter_${ name }`;

	const readFromUrl = (): ListState< F > => {
		const params = new URLSearchParams( window.location.search );

		const filters = {} as F;
		for ( const name of Object.keys( filterDefaults ) as Array<
			keyof F
		> ) {
			filters[ name ] = ( params.get( filterKey( String( name ) ) ) ??
				filterDefaults[ name ] ) as F[ typeof name ];
		}

		return {
			page: clamp(
				parseInt( params.get( pageKey ) ?? '1', 10 ),
				1,
				Infinity
			),
			perPage: clamp(
				parseInt(
					params.get( perPageKey ) ?? String( defaultPerPage ),
					10
				),
				1,
				100
			),
			filters,
		};
	};

	const [ state, setState ] = useState< ListState< F > >( readFromUrl );

	useEffect( () => {
		const onPopState = () => setState( readFromUrl() );

		window.addEventListener( 'popstate', onPopState );
		return () => window.removeEventListener( 'popstate', onPopState );
		// Intentionally runs once — pageKey/perPageKey/filterDefaults come
		// from this call's own arguments, which callers pass as stable
		// literals.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	const writeToUrl = ( next: ListState< F > ) => {
		const url = new URL( window.location.href );

		if ( next.page === 1 ) {
			url.searchParams.delete( pageKey );
		} else {
			url.searchParams.set( pageKey, String( next.page ) );
		}

		if ( next.perPage === defaultPerPage ) {
			url.searchParams.delete( perPageKey );
		} else {
			url.searchParams.set( perPageKey, String( next.perPage ) );
		}

		for ( const name of Object.keys( filterDefaults ) as Array<
			keyof F
		> ) {
			const value = next.filters[ name ];

			if ( value === filterDefaults[ name ] ) {
				url.searchParams.delete( filterKey( String( name ) ) );
			} else {
				url.searchParams.set( filterKey( String( name ) ), value );
			}
		}

		window.history.pushState( {}, '', url );
		setState( next );
	};

	return {
		page: state.page,
		perPage: state.perPage,
		filters: state.filters,
		setPage: ( page: number ) => writeToUrl( { ...state, page } ),
		setPerPage: ( perPage: number ) =>
			writeToUrl( { ...state, page: 1, perPage } ),
		setFilter: ( key: keyof F, value: string ) =>
			writeToUrl( {
				...state,
				page: 1,
				filters: { ...state.filters, [ key ]: value },
			} ),
	};
}

function clamp( value: number, min: number, max: number ): number {
	if ( Number.isNaN( value ) ) {
		return min;
	}

	return Math.min( Math.max( value, min ), max );
}
