import { useEffect } from '@wordpress/element';
import { useDirtyState } from './useDirtyState';

// One shared flag any screen's dirty form contributes to — lets the app
// shell (sidebar navigation, browser unload) warn before discarding changes,
// without every screen having to wire that up itself.
let globalDirty = false;

export function hasUnsavedChanges(): boolean {
	return globalDirty;
}

/**
 * Drop-in replacement for useDirtyState that also reports into the global flag.
 * @param current
 */
export function useGlobalDirtyState< T >( current: T ): {
	isDirty: boolean;
	markClean: () => void;
} {
	const { isDirty, markClean } = useDirtyState( current );

	useEffect( () => {
		globalDirty = isDirty;
		return () => {
			globalDirty = false;
		};
	}, [ isDirty ] );

	return { isDirty, markClean };
}
