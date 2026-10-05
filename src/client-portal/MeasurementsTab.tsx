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

	const today = new Date().toISOString().slice( 0, 10 );

	// The whole look-back window is fetched once; "Load more" / "Show less"
	// only change how much of it is shown, so we know exactly when nothing
	// older is left to reveal.
	const loadMeasurements = () => {
		apiFetch< Measurement[] >( {
			path: `/merodiet/v1/me/measurements?from=${ daysAgo(
				HISTORY_MAX_DAYS - 1
			) }&to=${ today }`,
		} ).then( setMeasurements, () => setMeasurements( [] ) );
	};

	const loadMore = () =>
		setHistoryRangeDays( ( days ) =>
			Math.min( days + HISTORY_PAGE_DAYS, HISTORY_MAX_DAYS )
		);

	const showLess = () => setHistoryRangeDays( HISTORY_PAGE_DAYS );

	// eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only fetch.
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
				path: '/merodiet/v1/me/measurements',
				method: 'POST',
				data: payload,
			} );
			doAction( 'merodiet.clientPortal.measurementCreated', entry );
			setWeightInput( '' );
			setNotesInput( '' );
			toast.success( __( 'Measurement saved.', 'merodiet' ) );
			loadMeasurements();
		} catch ( error ) {
			toast.error(
				errorMessage(
					error,
					__( 'Something went wrong — please try again.', 'merodiet' )
				)
			);
		} finally {
			setIsSubmitting( false );
		}
	};

	// Weighed entries only, in the same most-recent-first order the API
	// returns — used to compute the per-row and overall trend deltas.
	const cutoff = daysAgo( historyRangeDays - 1 );
	const visible = ( measurements ?? [] ).filter(
		( m ) => m.measured_at >= cutoff
	);
	const hasOlder = ( measurements ?? [] ).length > visible.length;
	const weighed = visible.filter(
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
			<div className="merodiet-topbar">
				<h1>{ __( 'Measurements', 'merodiet' ) }</h1>
			</div>
			<Panel>
				<PanelBody>
					<form onSubmit={ submit } className={ styles.form }>
						<div className="merodiet-field">
							<label htmlFor="merodiet-weight-input">
								{ __( 'Weight', 'merodiet' ) }
							</label>
							<div className={ styles.weightRow }>
								<input
									id="merodiet-weight-input"
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
										{ __( 'kg', 'merodiet' ) }
									</option>
									<option value="lb">
										{ __( 'lb', 'merodiet' ) }
									</option>
								</select>
							</div>
						</div>
						<div className="merodiet-field">
							<label htmlFor="merodiet-weight-notes">
								{ __( 'Notes (optional)', 'merodiet' ) }
							</label>
							<textarea
								id="merodiet-weight-notes"
								value={ notesInput }
								onChange={ ( event ) =>
									setNotesInput( event.target.value )
								}
								placeholder={ __(
									'e.g. measured after workout',
									'merodiet'
								) }
							/>
						</div>
						<Button
							type="submit"
							variant="primary"
							disabled={ isSubmitting }
						>
							{ __( 'Log weight', 'merodiet' ) }
						</Button>
					</form>

					<h3 className={ styles.historyTitle }>
						{ __( 'History', 'merodiet' ) }
					</h3>
					{ undefined === measurements && <HistorySkeleton /> }
					{ null !== netChange && (
						<p className={ styles.trendSummary }>
							{ netChange === 0
								? sprintf(
										/* translators: %d: number of weigh-ins the summary covers */
										__(
											'No change over your last %d entries.',
											'merodiet'
										),
										weighed.length
								  )
								: sprintf(
										/* translators: 1: "Up"/"Down", 2: the amount changed, 3: unit (kg/lb), 4: number of weigh-ins the summary covers */
										__(
											'%1$s %2$s %3$s over your last %4$d entries.',
											'merodiet'
										),
										netChange > 0
											? __( 'Up', 'merodiet' )
											: __( 'Down', 'merodiet' ),
										String( Math.abs( netChange ) ),
										unit,
										weighed.length
								  ) }
						</p>
					) }
					{ measurements && (
						<MeasurementHistoryList
							measurements={ visible }
							unit={ unit }
							emptyMessage={
								hasOlder
									? sprintf(
											/* translators: %d: number of days the history currently covers */
											__(
												'No measurements in the last %d days — use Load more to see older ones.',
												'merodiet'
											),
											historyRangeDays
									  )
									: undefined
							}
						/>
					) }

					{ measurements &&
						( hasOlder ||
							historyRangeDays > HISTORY_PAGE_DAYS ) && (
							<div className={ styles.historyActions }>
								{ historyRangeDays > HISTORY_PAGE_DAYS && (
									<button
										type="button"
										className={ styles.loadMore }
										onClick={ showLess }
									>
										{ __( 'Show less', 'merodiet' ) }
									</button>
								) }
								{ hasOlder && (
									<button
										type="button"
										className={ styles.loadMore }
										onClick={ loadMore }
									>
										{ __( 'Load more', 'merodiet' ) }
									</button>
								) }
							</div>
						) }
				</PanelBody>
			</Panel>
		</>
	);
}
