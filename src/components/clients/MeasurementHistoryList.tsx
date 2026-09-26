import { formatDate } from '../../utils/date';
import { gramsToDisplay, type WeightUnit } from '../../utils/weight';
import type { Measurement } from '../../types';
import styles from './MeasurementHistoryList.module.css';

interface MeasurementHistoryListProps {
	measurements: Measurement[];
	unit: WeightUnit;
}

// Extracted from client-portal/MeasurementsTab.tsx's history <ul> so the
// practitioner-facing ClientDetail screen can render the identical
// delta-annotated history view without duplicating this logic.
export default function MeasurementHistoryList( {
	measurements,
	unit,
}: MeasurementHistoryListProps ) {
	return (
		<ul className={ styles.historyList }>
			{ measurements.map( ( measurement, index ) => {
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
