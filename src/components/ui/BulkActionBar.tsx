import { __, sprintf } from '@wordpress/i18n';
import type { ReactNode } from 'react';
import styles from './BulkActionBar.module.css';

interface BulkActionBarProps {
	count: number;
	onClear: () => void;
	/** Screen-specific action buttons (e.g. "Mark active", "Delete selected"). */
	children: ReactNode;
}

// One shared bar every list screen's bulk selection renders — appears once
// at least one row is checked. Actions themselves are screen-specific and
// passed in as children, since what "bulk delete" pairs with differs
// per screen (a status toggle, an unassign action, or nothing else).
export default function BulkActionBar( {
	count,
	onClear,
	children,
}: BulkActionBarProps ) {
	if ( count === 0 ) {
		return null;
	}

	return (
		<div className={ styles.bar }>
			<span className={ styles.count }>
				{ sprintf(
					/* translators: %d: number of selected rows */
					__( '%d selected', 'nutrio' ),
					count
				) }
			</span>
			<div className={ styles.actions }>{ children }</div>
			<button className={ styles.clear } onClick={ onClear }>
				{ __( 'Clear', 'nutrio' ) }
			</button>
		</div>
	);
}
