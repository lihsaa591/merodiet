import { useEffect, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import { doAction } from '@wordpress/hooks';
import Button from '../components/ui/Button';
import Panel, { PanelBody } from '../components/ui/Panel';
import Skeleton from '../components/ui/Skeleton';
import MeasurementHistoryList from '../components/clients/MeasurementHistoryList';
import {
	readStoredWeightUnit,
	storeWeightUnit,
	gramsToDisplay,
	displayToGrams,
	type WeightUnit,
} from '../utils/weight';
import type { Measurement, MeasurementInput } from '../types';
import styles from './MeasurementsTab.module.css';
import { errorMessage, toast } from '../utils/toast';

// How many days back the history fetches, including today — starts at
// one page, "Load more" widens the window up to the cap. Weigh-ins are
// naturally low-frequency (daily at most), so a day-range window is a
// reasonable stand-in for true offset pagination, which the endpoint
// doesn't support.
const HISTORY_PAGE_DAYS = 30;
const HISTORY_MAX_DAYS = 365;

function daysAgo( days: number ): string {
	const date = new Date();
	date.setDate( date.getDate() - days );
	return date.toISOString().slice( 0, 10 );
}

// Mirrors a handful of history rows while the real list loads.
function HistorySkeleton() {
	return (
		<div>
			{ [ 0, 1, 2 ].map( ( row ) => (
				<div key={ row } className={ styles.historyItem }>
					<div className={ styles.historyRow }>
						<Skeleton width="35%" height="13px" />
						<Skeleton width="60px" height="13px" />
					</div>
				</div>
			) ) }
		</div>
	);
}

export default function MeasurementsTab() {
	const [ unit, setUnit ] = useState< WeightUnit >( readStoredWeightUnit );
	const [ measurements, setMeasurements ] = useState<
		Measurement[] | undefined
	>( undefined );
	const [ weightInput, setWeightInput ] = useState( '' );
	const [ notesInput, setNotesInput ] = useState( '' );
	const [ isSubmitting, setIsSubmitting ] = useState( false );
	const [ historyRangeDays, setHistoryRangeDays ] =
		useState( HISTORY_PAGE_DAYS );
	const [ isLoadingMore, setIsLoadingMore ] = useState( false );

	const today = new Date().toISOString().slice( 0, 10 );

	const loadMeasurements = () => {
		apiFetch< Measurement[] >( {
			path: `/nutrio/v1/me/measurements?from=${ daysAgo(
				historyRangeDays - 1
			) }&to=${ today }`,
		} ).then( setMeasurements, () => setMeasurements( [] ) );
	};

	const loadMore = () => {
		const nextRange = Math.min(
			historyRangeDays + HISTORY_PAGE_DAYS,
			HISTORY_MAX_DAYS
		);
		setIsLoadingMore( true );

		apiFetch< Measurement[] >( {
			path: `/nutrio/v1/me/measurements?from=${ daysAgo(
				nextRange - 1
			) }&to=${ today }`,
		} )
			.then( ( entries ) => {
				setMeasurements( entries );
				setHistoryRangeDays( nextRange );
			} )
			.catch( () => {} )
			.finally( () => setIsLoadingMore( false ) );
	};

	// eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only fetch; loadMore() (not this effect) is what advances historyRangeDays.
	useEffect( loadMeasurements, [] );

	const changeUnit = ( next: WeightUnit ) => {
		setUnit( next );
		storeWeightUnit( next );
	};

	const submit = async ( event: React.FormEvent ) => {
		event.preventDefault();
		const value = parseFloat( weightInput );

		if ( ! value || value <= 0 ) {
			return;
		}

		setIsSubmitting( true );

		try {
			const payload: MeasurementInput = {
				measured_at: new Date().toISOString().slice( 0, 10 ),
				weight_grams: displayToGrams( value, unit ),
				notes: notesInput.trim() || undefined,
			};
			const entry = await apiFetch< Measurement >( {
				path: '/nutrio/v1/me/measurements',
				method: 'POST',
				data: payload,
			} );
			doAction( 'nutrio.clientPortal.measurementCreated', entry );
			setWeightInput( '' );
			setNotesInput( '' );
			toast.success( __( 'Measurement saved.', 'nutrio' ) );
			loadMeasurements();
		} catch ( error ) {
			toast.error(
				errorMessage(
					error,
					__( 'Something went wrong — please try again.', 'nutrio' )
				)
			);
		} finally {
			setIsSubmitting( false );
		}
	};

	// Weighed entries only, in the same most-recent-first order the API
	// returns — used to compute the per-row and overall trend deltas.
	const weighed = ( measurements ?? [] ).filter(
		( m ): m is Measurement & { weight_grams: number } =>
			null !== m.weight_grams
	);
	const netChange =
		weighed.length > 1
			? Math.round(
					( gramsToDisplay( weighed[ 0 ].weight_grams, unit ) -
						gramsToDisplay(
							weighed[ weighed.length - 1 ].weight_grams,
							unit
						) ) *
						10
			  ) / 10
			: null;

	return (
		<>
			<div className="nutrio-topbar">
				<h1>{ __( 'Measurements', 'nutrio' ) }</h1>
			</div>
			<Panel>
				<PanelBody>
					<form onSubmit={ submit } className={ styles.form }>
						<div className="nutrio-field">
							<label htmlFor="nutrio-weight-input">
								{ __( 'Weight', 'nutrio' ) }
							</label>
							<div className={ styles.weightRow }>
								<input
									id="nutrio-weight-input"
									type="number"
									step="0.1"
									min="0"
									value={ weightInput }
									onChange={ ( event ) =>
										setWeightInput( event.target.value )
									}
									required
								/>
								<select
									value={ unit }
									onChange={ ( event ) =>
										changeUnit(
											event.target.value as WeightUnit
										)
									}
								>
									<option value="kg">
										{ __( 'kg', 'nutrio' ) }
									</option>
									<option value="lb">
										{ __( 'lb', 'nutrio' ) }
									</option>
								</select>
							</div>
						</div>
						<div className="nutrio-field">
							<label htmlFor="nutrio-weight-notes">
								{ __( 'Notes (optional)', 'nutrio' ) }
							</label>
							<textarea
								id="nutrio-weight-notes"
								value={ notesInput }
								onChange={ ( event ) =>
									setNotesInput( event.target.value )
								}
								placeholder={ __(
									'e.g. measured after workout',
									'nutrio'
								) }
							/>
						</div>
						<Button
							type="submit"
							variant="primary"
							disabled={ isSubmitting }
						>
							{ __( 'Log weight', 'nutrio' ) }
						</Button>
					</form>

					<h3 className={ styles.historyTitle }>
						{ __( 'History', 'nutrio' ) }
					</h3>
					{ undefined === measurements && <HistorySkeleton /> }
					{ measurements && 0 === measurements.length && (
						<p className={ styles.empty }>
							{ __( 'No measurements logged yet.', 'nutrio' ) }
						</p>
					) }
					{ null !== netChange && (
						<p className={ styles.trendSummary }>
							{ netChange === 0
								? sprintf(
										/* translators: %d: number of weigh-ins the summary covers */
										__(
											'No change over your last %d entries.',
											'nutrio'
										),
										weighed.length
								  )
								: sprintf(
										/* translators: 1: "Up"/"Down", 2: the amount changed, 3: unit (kg/lb), 4: number of weigh-ins the summary covers */
										__(
											'%1$s %2$s %3$s over your last %4$d entries.',
											'nutrio'
										),
										netChange > 0
											? __( 'Up', 'nutrio' )
											: __( 'Down', 'nutrio' ),
										String( Math.abs( netChange ) ),
										unit,
										weighed.length
								  ) }
						</p>
					) }
					{ measurements && measurements.length > 0 && (
						<MeasurementHistoryList
							measurements={ measurements }
							unit={ unit }
						/>
					) }

					{ measurements && historyRangeDays < HISTORY_MAX_DAYS && (
						<button
							type="button"
							className={ styles.loadMore }
							onClick={ loadMore }
							disabled={ isLoadingMore }
						>
							{ isLoadingMore
								? __( 'Loading…', 'nutrio' )
								: __( 'Load more', 'nutrio' ) }
						</button>
					) }
				</PanelBody>
			</Panel>
		</>
	);
}
