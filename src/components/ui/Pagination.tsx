import { __, sprintf } from '@wordpress/i18n';
import styles from './Pagination.module.css';

const DEFAULT_PER_PAGE_OPTIONS = [ 5, 10, 20, 50 ];

interface PaginationProps {
	page: number;
	totalPages: number;
	onPageChange: ( page: number ) => void;
	/** Total row count across every page — omit to hide the "Showing X–Y of Z" range text. */
	total?: number;
	perPage?: number;
	onPerPageChange?: ( perPage: number ) => void;
	perPageOptions?: number[];
}

// Shared pager for any list screen — Prev/Next plus "Page X of Y" rather
// than numbered page buttons, since a jump-to-page-5 control isn't worth
// the complexity at the row counts this app's lists actually reach.
// Always renders, even at a single page (Prev/Next just come up disabled),
// so the control doesn't appear/disappear as a list crosses the page-size
// threshold. `total`/`perPage`/`onPerPageChange` are optional — a caller
// that doesn't track per-page size yet still gets the basic pager.
export default function Pagination( {
	page,
	totalPages,
	onPageChange,
	total,
	perPage,
	onPerPageChange,
	perPageOptions = DEFAULT_PER_PAGE_OPTIONS,
}: PaginationProps ) {
	const range =
		total !== undefined && perPage !== undefined
			? rangeText( page, perPage, total )
			: null;

	return (
		<div className={ styles.pagination }>
			{ range ? (
				<span className={ styles.status }>{ range }</span>
			) : (
				<span />
			) }

			<div className={ styles.controls }>
				{ perPage !== undefined && onPerPageChange && (
					<div className={ styles.perPage }>
						<label htmlFor="nutrio-per-page">
							{ __( 'Per page', 'nutrio' ) }
						</label>
						<div className="nutrio-field">
							<select
								id="nutrio-per-page"
								value={ perPage }
								onChange={ ( event ) =>
									onPerPageChange(
										Number( event.target.value )
									)
								}
							>
								{ perPageOptions.map( ( option ) => (
									<option key={ option } value={ option }>
										{ option }
									</option>
								) ) }
							</select>
						</div>
					</div>
				) }

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
		</div>
	);
}

function rangeText( page: number, perPage: number, total: number ): string {
	if ( total === 0 ) {
		return __( 'No results', 'nutrio' );
	}

	const start = ( page - 1 ) * perPage + 1;
	const end = Math.min( page * perPage, total );

	return sprintf(
		/* translators: 1: first row number shown, 2: last row number shown, 3: total row count */
		__( 'Showing %1$d–%2$d of %3$d', 'nutrio' ),
		start,
		end,
		total
	);
}
