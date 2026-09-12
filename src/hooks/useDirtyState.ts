import { useRef } from '@wordpress/element';

// Snapshots a form's values on first render and reports whether they've since
// diverged — one hook any form can use instead of hand-tracking "did the user
// change anything" per field. Call markClean() after a successful save to
// reset the baseline (so staying on the same form afterwards reads as clean).
export function useDirtyState< T >( current: T ): {
	isDirty: boolean;
	markClean: () => void;
} {
	const baseline = useRef( JSON.stringify( current ) );

	return {
		isDirty: JSON.stringify( current ) !== baseline.current,
		markClean: () => {
			baseline.current = JSON.stringify( current );
		},
	};
}
