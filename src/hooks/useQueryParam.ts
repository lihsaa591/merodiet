import { useEffect, useState } from '@wordpress/element';

// Keeps state synced with a URL query param (e.g. `?view=recipes&id=7`) so
// edit/detail screens are deep-linkable and survive a refresh or back/forward.
export function useQueryParam(
	key: string
): [ string | null, ( value: string | null ) => void ] {
	const [ value, setValue ] = useState< string | null >( () =>
		new URLSearchParams( window.location.search ).get( key )
	);

	useEffect( () => {
		const onPopState = () =>
			setValue(
				new URLSearchParams( window.location.search ).get( key )
			);

		window.addEventListener( 'popstate', onPopState );
		return () => window.removeEventListener( 'popstate', onPopState );
	}, [ key ] );

	const set = ( next: string | null ) => {
		setValue( next );

		const url = new URL( window.location.href );

		if ( next === null ) {
			url.searchParams.delete( key );
		} else {
			url.searchParams.set( key, next );
		}

		window.history.pushState( {}, '', url );
	};

	return [ value, set ];
}
