import { useState } from '@wordpress/element';

interface HasId {
	id: number;
}

// Generic row-selection state for any list screen's bulk-action bar — keeps
// selection as a Set of ids rather than object references, so it survives
// the list re-fetching/re-rendering with new object identities.
export function useBulkSelection< T extends HasId >( items: T[] ) {
	const [ selectedIds, setSelectedIds ] = useState< Set< number > >(
		new Set()
	);

	const isSelected = ( id: number ) => selectedIds.has( id );

	const toggle = ( id: number ) => {
		setSelectedIds( ( prev ) => {
			const next = new Set( prev );
			if ( next.has( id ) ) {
				next.delete( id );
			} else {
				next.add( id );
			}
			return next;
		} );
	};

	const isAllSelected =
		items.length > 0 &&
		items.every( ( item ) => selectedIds.has( item.id ) );
	const isSomeSelected = selectedIds.size > 0 && ! isAllSelected;

	const toggleAll = () => {
		setSelectedIds(
			isAllSelected
				? new Set()
				: new Set( items.map( ( item ) => item.id ) )
		);
	};

	const clear = () => setSelectedIds( new Set() );

	const selectedItems = items.filter( ( item ) =>
		selectedIds.has( item.id )
	);

	return {
		isSelected,
		toggle,
		toggleAll,
		isAllSelected,
		isSomeSelected,
		clear,
		selectedItems,
		count: selectedIds.size,
	};
}
