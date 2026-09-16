import { __, sprintf } from '@wordpress/i18n';
import styles from './Pagination.module.css';

interface PaginationProps {
	page: number;
	totalPages: number;
	onPageChange: ( page: number ) => void;
}

// Shared pager for any list screen — Prev/Next plus "Page X of Y" rather
// than numbered page buttons, since a jump-to-page-5 control isn't worth
// the complexity at the row counts this app's lists actually reach.
export default function Pagination( {
	page,
	totalPages,
	onPageChange,
}: PaginationProps ) {
	if ( totalPages <= 1 ) {
		return null;
	}

	return (
		<div className={ styles.pagination }>
			<button
				className={ styles.navBtn }
				onClick={ () => onPageChange( page - 1 ) }
				disabled={ page <= 1 }
			>
				{ __( 'Previous', 'nutrio' ) }
			</button>
			<span className={ styles.status }>
				{ sprintf(
					/* translators: 1: current page number, 2: total number of pages */
					__( 'Page %1$d of %2$d', 'nutrio' ),
					page,
					totalPages
				) }
			</span>
			<button
				className={ styles.navBtn }
				onClick={ () => onPageChange( page + 1 ) }
				disabled={ page >= totalPages }
			>
				{ __( 'Next', 'nutrio' ) }
			</button>
		</div>
	);
}
