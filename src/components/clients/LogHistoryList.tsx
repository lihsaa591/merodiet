import { __ } from '@wordpress/i18n';
import { formatDate } from '../../utils/date';
import type { LogEntry } from '../../types';
import styles from './LogHistoryList.module.css';

interface LogHistoryListProps {
	entriesByDate: Record< string, LogEntry[] >;
	/** Plan item id -> display label, for entries logged against a plan item. Entries without a match fall back to their own notes. */
	itemLabels?: Record< number, string >;
}

export const STATUS_LABELS: Record< LogEntry[ 'status' ], string > = {
	eaten: __( 'Eaten', 'nutrio' ),
	substituted: __( 'Substituted', 'nutrio' ),
	skipped: __( 'Skipped', 'nutrio' ),
};

// A history entry's display label — the plan item it was logged against,
// or (for an ad-hoc "log something else" entry, which has no plan_item_id)
// its own free-text notes, since that free text IS the food description.
function entryLabel(
	entry: LogEntry,
	itemLabels: Record< number, string >
): string {
	if ( null !== entry.plan_item_id && itemLabels[ entry.plan_item_id ] ) {
		return itemLabels[ entry.plan_item_id ];
	}

	if ( entry.label ) {
		return entry.label;
	}

	return entry.notes ?? __( 'Logged item', 'nutrio' );
}

// Extracted from client-portal/LogTab.tsx's "Recent history" section so
// the practitioner-facing ClientDetail screen can render the identical
// history view without a second, near-identical copy of this logic.
export default function LogHistoryList( {
	entriesByDate,
	itemLabels = {},
}: LogHistoryListProps ) {
	const pastDates = Object.keys( entriesByDate ).sort( ( a, b ) =>
		b.localeCompare( a )
	);

	if ( 0 === pastDates.length ) {
		return (
			<p className={ styles.empty }>
				{ __( 'Nothing logged yet.', 'nutrio' ) }
			</p>
		);
	}

	return (
		<>
			{ pastDates.map( ( date ) => (
				<div key={ date } className={ styles.historyDay }>
					<div className={ styles.historyDate }>
						{ formatDate( date ) }
					</div>
					<ul className={ styles.historyList }>
						{ ( entriesByDate[ date ] ?? [] ).map( ( entry ) => (
							<li
								key={ entry.id }
								className={ styles.historyItem }
							>
								<div>
									<div className={ styles.historyLabel }>
										{ entryLabel( entry, itemLabels ) }
									</div>
									{ entry.notes &&
										null !== entry.plan_item_id &&
										entry.notes !==
											entryLabel( entry, itemLabels ) && (
											<div
												className={ styles.historyNote }
											>
												{ entry.notes }
											</div>
										) }
								</div>
								<span
									className={ `${ styles.statusPill } ${
										styles[ entry.status ]
									}` }
								>
									{ STATUS_LABELS[ entry.status ] }
								</span>
							</li>
						) ) }
					</ul>
				</div>
			) ) }
		</>
	);
}
