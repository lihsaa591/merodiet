import { useEffect, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import Panel, { PanelBody } from '../components/ui/Panel';
import Skeleton from '../components/ui/Skeleton';
import {
	MEAL_ORDER,
	MEAL_LABELS,
	MEAL_ICONS,
	itemsByMeal,
	itemQuantityLabel,
	toEstimateInput,
	todaysDayOffset,
} from './mealMeta';
import NextPlanBanner from './NextPlanBanner';
import { STATUS_LABELS } from '../components/clients/LogHistoryList';
import { estimateDayNutrients, formatAmount } from '../utils/nutrients';
import { gramsToDisplay, readStoredWeightUnit } from '../utils/weight';
import { greeting, greetingEmoji } from '../utils/greeting';
import type { LogEntry, Measurement, Plan, PlanItem } from '../types';
import styles from './DashboardTab.module.css';

// Mirrors the eventual KPI row + today's-plan panel shape.
function DashboardSkeleton() {
	return (
		<div>
			<div className={ styles.kpiRow }>
				{ [ 0, 1, 2 ].map( ( index ) => (
					<div key={ index } className="merodiet-kpi">
						<Skeleton width="70px" height="11px" />
						<div style={ { marginTop: '8px' } }>
							<Skeleton width="60px" height="26px" />
						</div>
					</div>
				) ) }
			</div>
			<div style={ { marginTop: '20px' } }>
				<Skeleton width="120px" height="15px" />
			</div>
			<div className={ styles.item } style={ { marginTop: '10px' } }>
				<Skeleton width="55%" height="14px" />
			</div>
			<div className={ styles.item }>
				<Skeleton width="40%" height="14px" />
			</div>
		</div>
	);
}

export default function DashboardTab() {
	const [ plan, setPlan ] = useState< Plan | null | undefined >( undefined );
	const [ todayLogs, setTodayLogs ] = useState< LogEntry[] | undefined >(
		undefined
	);
	const [ measurements, setMeasurements ] = useState<
		Measurement[] | undefined
	>( undefined );

	const today = new Date().toISOString().slice( 0, 10 );
	const unit = readStoredWeightUnit();

	useEffect( () => {
		apiFetch< Plan | null >( { path: '/merodiet/v1/me/plan' } ).then(
			setPlan,
			() => setPlan( null )
		);

		apiFetch< LogEntry[] >( {
			path: `/merodiet/v1/me/logs?from=${ today }&to=${ today }`,
		} ).then( setTodayLogs, () => setTodayLogs( [] ) );

		// A 60-day window is more than enough to find the latest weigh-in
		// and the one before it for a trend — this is a glance, not the
		// full history the Measurements tab itself shows.
		const sixtyDaysAgo = new Date();
		sixtyDaysAgo.setDate( sixtyDaysAgo.getDate() - 59 );
		apiFetch< Measurement[] >( {
			path: `/merodiet/v1/me/measurements?from=${ sixtyDaysAgo
				.toISOString()
				.slice( 0, 10 ) }&to=${ today }`,
		} ).then( setMeasurements, () => setMeasurements( [] ) );
		// eslint-disable-next-line react-hooks/exhaustive-deps -- `today`/`unit` are stable for the component's lifetime.
	}, [] );

	const isLoading =
		undefined === plan ||
		undefined === todayLogs ||
		undefined === measurements;

	const todaysItems: PlanItem[] =
		plan?.days.find(
			( day ) => day.day_offset === todaysDayOffset( plan.start_date )
		)?.items ?? [];

	const loggedByItemId: Record< number, LogEntry[ 'status' ] > = {};
	for ( const entry of todayLogs ?? [] ) {
		if ( null !== entry.plan_item_id ) {
			loggedByItemId[ entry.plan_item_id ] = entry.status;
		}
	}
	const loggedCount = todaysItems.filter(
		( item ) => undefined !== loggedByItemId[ item.id ]
	).length;

	const eatenItems = todaysItems.filter(
		( item ) => 'eaten' === loggedByItemId[ item.id ]
	);
	const eatenKcal = estimateDayNutrients(
		eatenItems.map( toEstimateInput )
	).kcal;
	const plannedKcal = estimateDayNutrients(
		todaysItems.map( toEstimateInput )
	).kcal;

	const weighed = ( measurements ?? [] ).filter(
		( m ): m is Measurement & { weight_grams: number } =>
			null !== m.weight_grams
	);
	const latestWeight = weighed[ 0 ] ?? null;
	const weightDelta =
		weighed.length > 1
			? Math.round(
					( gramsToDisplay( weighed[ 0 ].weight_grams, unit ) -
						gramsToDisplay( weighed[ 1 ].weight_grams, unit ) ) *
						10
			  ) / 10
			: null;

	const grouped = itemsByMeal( todaysItems );

	return (
		<>
			<div className="merodiet-topbar">
				<div>
					<h1>
						{ greeting() } { greetingEmoji() }
					</h1>
					<div className="merodiet-topbar-sub">
						{ new Date().toLocaleDateString( undefined, {
							weekday: 'long',
							month: 'long',
							day: 'numeric',
						} ) }
					</div>
				</div>
			</div>

			{ isLoading && <DashboardSkeleton /> }

			{ ! isLoading && (
				<>
					<div className={ styles.kpiRow }>
						<div className="merodiet-kpi">
							<div className="merodiet-kpi-label">
								{ __( 'Logged today', 'merodiet' ) }
							</div>
							<div className="merodiet-kpi-value">
								{ todaysItems.length > 0
									? `${ loggedCount }/${ todaysItems.length }`
									: '—' }
							</div>
						</div>
						<div className="merodiet-kpi">
							<div className="merodiet-kpi-label">
								{ __( 'Kcal eaten', 'merodiet' ) }
							</div>
							<div className="merodiet-kpi-value">
								{ null !== eatenKcal || null !== plannedKcal
									? formatAmount( eatenKcal ?? 0, '' )
									: '—' }
							</div>
							{ null !== plannedKcal && (
								<div className="merodiet-kpi-delta">
									{ sprintf(
										/* translators: %s: total kcal planned for today */
										__( 'of %s planned', 'merodiet' ),
										formatAmount( plannedKcal, '' )
									) }
								</div>
							) }
						</div>
						<div className="merodiet-kpi">
							<div className="merodiet-kpi-label">
								{ __( 'Current weight', 'merodiet' ) }
							</div>
							<div className="merodiet-kpi-value">
								{ latestWeight
									? `${ gramsToDisplay(
											latestWeight.weight_grams,
											unit
									  ) } ${ unit }`
									: '—' }
							</div>
							{ null !== weightDelta && 0 !== weightDelta && (
								<div className="merodiet-kpi-delta">
									{ weightDelta > 0 ? '↑' : '↓' }{ ' ' }
									{ Math.abs( weightDelta ) } { unit }{ ' ' }
									{ __( 'since last', 'merodiet' ) }
								</div>
							) }
						</div>
					</div>

					<Panel>
						<PanelBody>
							<h3 className={ styles.sectionTitle }>
								{ __( "Today's plan", 'merodiet' ) }
							</h3>

							{ null === plan && (
								<p className={ styles.empty }>
									{ __(
										'No plan assigned yet — check back once your practitioner assigns one.',
										'merodiet'
									) }
								</p>
							) }

							{ plan && todaysItems.length === 0 && (
								<p className={ styles.empty }>
									{ __(
										'Nothing planned for today.',
										'merodiet'
									) }
								</p>
							) }

							{ MEAL_ORDER.filter(
								( meal ) => ( grouped[ meal ] ?? [] ).length > 0
							).map( ( meal ) => (
								<div key={ meal } className={ styles.meal }>
									<h4 className={ styles.mealTitle }>
										<svg
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="1.8"
										>
											{ MEAL_ICONS[ meal ] }
										</svg>
										{ MEAL_LABELS[ meal ] }
									</h4>
									<ul className={ styles.itemList }>
										{ ( grouped[ meal ] ?? [] ).map(
											( item ) => (
												<li
													key={ item.id }
													className={ styles.item }
												>
													<div>
														<div
															className={
																styles.itemName
															}
														>
															{ item.food_description ??
																item.recipe_name ??
																__(
																	'Item',
																	'merodiet'
																) }
														</div>
														{ itemQuantityLabel(
															item
														) && (
															<div
																className={
																	styles.itemMeta
																}
															>
																{ itemQuantityLabel(
																	item
																) }
															</div>
														) }
													</div>
													{ loggedByItemId[
														item.id
													] && (
														<span
															className={ `${
																styles.statusPill
															} ${
																styles[
																	loggedByItemId[
																		item.id
																	]
																]
															}` }
														>
															{
																STATUS_LABELS[
																	loggedByItemId[
																		item.id
																	]
																]
															}
														</span>
													) }
												</li>
											)
										) }
									</ul>
								</div>
							) ) }
						</PanelBody>
					</Panel>

					<NextPlanBanner />
				</>
			) }
		</>
	);
}
