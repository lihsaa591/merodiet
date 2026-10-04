import { useEffect, useState } from '@wordpress/element';

const DEFAULT_THRESHOLD = 10;

// Whether a list screen's filter bar should be shown — once the list is
// ever seen with more than `threshold` rows, this stays true for the rest
// of the screen's lifetime, rather than re-evaluating `total > threshold`
// on every render.
//
// That distinction matters: `total` reflects whatever filter is currently
// applied. Clearing a search sets `isFiltering` to false in the same
// render `total` still holds the *filtered* (small) count, before the new
// unfiltered fetch resolves — recomputing visibility from both on every
// render would flash the filter bar closed for a frame, right as someone
// clears their search, only for it to reappear once the real total loads.
export function useShowFilters(
	total: number,
	isFiltering: boolean,
	threshold: number = DEFAULT_THRESHOLD
): boolean {
	const [ everExceeded, setEverExceeded ] = useState( total > threshold );

	useEffect( () => {
		if ( total > threshold ) {
			setEverExceeded( true );
		}
	}, [ total, threshold ] );

	return everExceeded || isFiltering;
}
