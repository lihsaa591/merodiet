import { __ } from '@wordpress/i18n';
import { formatDate } from '../../utils/date';
import { gramsToDisplay, type WeightUnit } from '../../utils/weight';
import type { Measurement } from '../../types';
import styles from './MeasurementHistoryList.module.css';

interface MeasurementHistoryListProps {
	measurements: Measurement[];
	unit: WeightUnit;
	/** Show only the newest N entries; deltas still use the full list. */
	limit?: number;
	/** Shown when there is nothing to list. */
	emptyMessage?: string;
}

// Extracted from client-portal/MeasurementsTab.tsx's history <ul> so the
// practitioner-facing ClientDetail screen can render the identical
// delta-annotated history view without duplicating this logic.
export default function MeasurementHistoryList( {
	measurements,
	unit,
	limit,
	emptyMessage,
}: MeasurementHistoryListProps ) {
	if ( 0 === measurements.length ) {
		return (
			<p className={ styles.empty }>
				{ emptyMessage ??
					__( 'No measurements logged yet.', 'merodiet' ) }
			</p>
		);
	}

	return (
		<ul className={ styles.historyList }>
			{ measurements.slice( 0, limit ).map( ( measurement, index ) => {
				const prevWeighed = measurements
					.slice( index + 1 )
					.find( ( m ) => null !== m.weight_grams );
				const delta =
					null !== measurement.weight_grams &&
					prevWeighed &&
					null !== prevWeighed.weight_grams
						? Math.round(
								( gramsToDisplay(
									measurement.weight_grams,
									unit
								) -
									gramsToDisplay(
										prevWeighed.weight_grams,
										unit
									) ) *
									10
						  ) / 10
						: null;

				return (
					<li key={ measurement.id } className={ styles.historyItem }>
						<div className={ styles.historyRow }>
							<span>
								{ formatDate( measurement.measured_at ) }
							</span>
							<div className={ styles.historyWeight }>
								<span>
									{ null !== measurement.weight_grams
										? `${ gramsToDisplay(
												measurement.weight_grams,
												unit
										  ) } ${ unit }`
										: '—' }
								</span>
								{ null !== delta && 0 !== delta && (
									<span className={ styles.historyDelta }>
										{ delta > 0 ? '↑' : '↓' }{ ' ' }
										{ Math.abs( delta ) } { unit }
									</span>
								) }
							</div>
						</div>
						{ measurement.notes && (
							<div className={ styles.historyNote }>
								{ measurement.notes }
							</div>
						) }
					</li>
				);
			} ) }
		</ul>
	);
}
