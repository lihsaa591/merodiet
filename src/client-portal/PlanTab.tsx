import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import Panel, { PanelBody } from '../components/ui/Panel';
import {
	estimateDayNutrients,
	formatAmount,
	listExtraNutrients,
} from '../utils/nutrients';
import { formatShortDate } from '../utils/date';
import {
	MEAL_ORDER,
	MEAL_LABELS,
	MEAL_ICONS,
	itemsByMeal,
	itemQuantityLabel,
} from './mealMeta';
import type { NextPlanSummary, Plan, PlanDay, PlanItem } from '../types';
import styles from './PlanTab.module.css';

// Mirrors the practitioner Plan builder's own pagination: past a week,
// showing every day in one row gets unwieldy for a multi-month plan.
const DAYS_PER_WEEK = 7;

// The plan's day_offset that corresponds to today, based on its start_date.
function todaysDayOffset( startDate: string ): number {
	const start = new Date( startDate + 'T00:00:00' );
	const today = new Date();
	today.setHours( 0, 0, 0, 0 );
	const diffMs = today.getTime() - start.getTime();
	return Math.floor( diffMs / ( 1000 * 60 * 60 * 24 ) );
}

function addDays( dateStr: string, days: number ): string {
	const date = new Date( dateStr + 'T00:00:00' );
	date.setDate( date.getDate() + days );
	return date.toISOString().slice( 0, 10 );
}

function toEstimateInput( item: PlanItem ) {
	return item.food_id
		? {
				kind: 'food' as const,
				quantity_grams: item.quantity_grams ?? 0,
				nutrients: item.nutrients ?? {},
		  }
		: {
				kind: 'recipe' as const,
				servings: item.servings ?? 0,
				nutrient_totals_per_serving:
					item.recipe_nutrient_totals_per_serving ?? {},
		  };
}

function itemKcal( item: PlanItem ): number | null {
	return estimateDayNutrients( [ toEstimateInput( item ) ] ).kcal;
}

export default function PlanTab() {
	const [ plan, setPlan ] = useState< Plan | null | undefined >( undefined );
	const [ activeDayOffset, setActiveDayOffset ] = useState< number | null >(
		null
	);
	const [ isNutritionExpanded, setIsNutritionExpanded ] = useState( false );
	const [ nextPlan, setNextPlan ] = useState< NextPlanSummary | null >(
		null
	);

	useEffect( () => {
		apiFetch< Plan | null >( { path: '/nutrio/v1/me/plan' } ).then(
			( data ) => {
				setPlan( data );

				if ( data && data.days.length > 0 ) {
					const todays = todaysDayOffset( data.start_date );
					const clamped = Math.min(
						Math.max( todays, data.days[ 0 ].day_offset ),
						data.days[ data.days.length - 1 ].day_offset
					);
					setActiveDayOffset( clamped );
				}
			},
			() => setPlan( null )
		);

		apiFetch< NextPlanSummary | null >( {
			path: '/nutrio/v1/me/plan/next',
		} )
			.then( setNextPlan )
			.catch( () => {} );
	}, [] );

	const activeDay: PlanDay | undefined = plan?.days.find(
		( day ) => day.day_offset === activeDayOffset
	);
	const todaysOffset = plan ? todaysDayOffset( plan.start_date ) : null;
	const dayTotals = activeDay
		? estimateDayNutrients( activeDay.items.map( toEstimateInput ) )
		: null;
	const grouped = activeDay ? itemsByMeal( activeDay.items ) : {};
	const extraNutrients = dayTotals ? listExtraNutrients( dayTotals ) : [];

	const activeWeekIndex =
		null !== activeDayOffset
			? Math.floor( activeDayOffset / DAYS_PER_WEEK )
			: 0;
	const weekCount = plan ? Math.ceil( plan.days.length / DAYS_PER_WEEK ) : 0;
	const visibleDays =
		plan && plan.days.length > DAYS_PER_WEEK
			? plan.days.filter(
					( day ) =>
						Math.floor( day.day_offset / DAYS_PER_WEEK ) ===
						activeWeekIndex
			  )
			: plan?.days ?? [];

	return (
		<>
			<div className="nutrio-topbar">
				<h1>{ __( 'My Plan', 'nutrio' ) }</h1>
			</div>
			<Panel>
				<PanelBody>
					{ undefined === plan && (
						<p>{ __( 'Loading…', 'nutrio' ) }</p>
					) }

					{ null === plan && (
						<p className={ styles.empty }>
							{ __(
								'No plan assigned yet — check back once your practitioner assigns one.',
								'nutrio'
							) }
						</p>
					) }

					{ plan && (
						<div>
							<h2 className={ styles.planTitle }>
								{ plan.title }
							</h2>
							<p className={ styles.dateRange }>
								{ formatShortDate( plan.start_date ) } –{ ' ' }
								{ formatShortDate( plan.end_date ) }
							</p>

							{ plan.days.length > DAYS_PER_WEEK && (
								<div className={ styles.weekTabs }>
									{ Array.from( {
										length: weekCount,
									} ).map( ( _, weekIndex ) => (
										<button
											key={ weekIndex }
											type="button"
											className={ `${ styles.weekTab } ${
												weekIndex === activeWeekIndex
													? styles.isActive
													: ''
											}`.trim() }
											onClick={ () =>
												setActiveDayOffset(
													weekIndex * DAYS_PER_WEEK
												)
											}
										>
											{ __( 'Week', 'nutrio' ) }{ ' ' }
											{ weekIndex + 1 }
											<span
												className={ styles.weekTabDate }
											>
												{ formatShortDate(
													addDays(
														plan.start_date,
														weekIndex *
															DAYS_PER_WEEK
													)
												) }
											</span>
										</button>
									) ) }
								</div>
							) }

							<div className={ styles.dayTabs }>
								{ visibleDays.map( ( day ) => (
									<button
										key={ day.day_offset }
										type="button"
										className={ `${ styles.dayTab } ${
											day.day_offset === activeDayOffset
												? styles.isActive
												: ''
										}`.trim() }
										onClick={ () =>
											setActiveDayOffset( day.day_offset )
										}
									>
										{ __( 'Day', 'nutrio' ) }{ ' ' }
										{ day.day_offset + 1 }
										<span className={ styles.dayTabDate }>
											{ formatShortDate(
												addDays(
													plan.start_date,
													day.day_offset
												)
											) }
										</span>
										{ day.day_offset === todaysOffset && (
											<span
												className={ styles.todayBadge }
											>
												{ __( 'Today', 'nutrio' ) }
											</span>
										) }
									</button>
								) ) }
							</div>

							{ activeDay && activeDay.items.length === 0 && (
								<p className={ styles.empty }>
									{ __(
										'Nothing planned for this day.',
										'nutrio'
									) }
								</p>
							) }

							{ MEAL_ORDER.filter(
								( meal ) => ( grouped[ meal ] ?? [] ).length > 0
							).map( ( meal ) => (
								<div key={ meal } className={ styles.meal }>
									<h3 className={ styles.mealTitle }>
										<svg
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="1.8"
										>
											{ MEAL_ICONS[ meal ] }
										</svg>
										{ MEAL_LABELS[ meal ] }
									</h3>
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
																	'nutrio'
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
													{ null !==
														itemKcal( item ) && (
														<span
															className={
																styles.itemKcal
															}
														>
															{ formatAmount(
																itemKcal(
																	item
																),
																' kcal'
															) }
														</span>
													) }
												</li>
											)
										) }
									</ul>
								</div>
							) ) }

							{ activeDay && activeDay.items.length > 0 && (
								<div className={ styles.totals }>
									<h3 className={ styles.totalsTitle }>
										{ __( 'Day total', 'nutrio' ) }
									</h3>
									<div className={ styles.nutrientGrid }>
										<div className={ styles.nutrientTile }>
											<div
												className={ styles.nutrientVal }
											>
												{ formatAmount(
													dayTotals?.kcal ?? null,
													' kcal'
												) }
											</div>
											<div
												className={ styles.nutrientLbl }
											>
												{ __( 'Kcal', 'nutrio' ) }
											</div>
										</div>
										<div className={ styles.nutrientTile }>
											<div
												className={ styles.nutrientVal }
											>
												{ formatAmount(
													dayTotals?.protein ?? null
												) }
											</div>
											<div
												className={ styles.nutrientLbl }
											>
												{ __( 'Protein', 'nutrio' ) }
											</div>
										</div>
										<div className={ styles.nutrientTile }>
											<div
												className={ styles.nutrientVal }
											>
												{ formatAmount(
													dayTotals?.carbs ?? null
												) }
											</div>
											<div
												className={ styles.nutrientLbl }
											>
												{ __( 'Carbs', 'nutrio' ) }
											</div>
										</div>
										<div className={ styles.nutrientTile }>
											<div
												className={ styles.nutrientVal }
											>
												{ formatAmount(
													dayTotals?.fat ?? null
												) }
											</div>
											<div
												className={ styles.nutrientLbl }
											>
												{ __( 'Fat', 'nutrio' ) }
											</div>
										</div>
									</div>

									{ extraNutrients.length > 0 && (
										<>
											<button
												type="button"
												className={
													styles.nutritionToggle
												}
												onClick={ () =>
													setIsNutritionExpanded(
														( expanded ) =>
															! expanded
													)
												}
											>
												{ isNutritionExpanded
													? __(
															'Hide full nutrition',
															'nutrio'
													  )
													: __(
															'Show full nutrition',
															'nutrio'
													  ) }
												<svg
													className={ `${
														styles.nutritionToggleIcon
													} ${
														isNutritionExpanded
															? styles.isOpen
															: ''
													}`.trim() }
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													strokeWidth="2"
												>
													<path d="M6 9l6 6 6-6" />
												</svg>
											</button>

											{ isNutritionExpanded && (
												<div
													className={
														styles.nutrientGrid
													}
												>
													{ extraNutrients.map(
														( nutrient ) => (
															<div
																key={
																	nutrient.key
																}
																className={
																	styles.nutrientTile
																}
															>
																<div
																	className={
																		styles.nutrientVal
																	}
																>
																	{ formatAmount(
																		nutrient.value,
																		` ${ nutrient.unit }`
																	) }
																</div>
																<div
																	className={
																		styles.nutrientLbl
																	}
																>
																	{
																		nutrient.label
																	}
																</div>
															</div>
														)
													) }
												</div>
											) }
										</>
									) }
								</div>
							) }
						</div>
					) }
				</PanelBody>
			</Panel>

			{ nextPlan && (
				<div className={ styles.nextPlanBanner }>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.8"
					>
						<rect x="3.5" y="4" width="17" height="16" rx="2" />
						<path d="M3.5 9h17M8 3v3M16 3v3" />
					</svg>
					<span>
						{ __( 'Next up:', 'nutrio' ) }{ ' ' }
						<strong>{ nextPlan.title }</strong>{ ' ' }
						{ __( 'starts', 'nutrio' ) }{ ' ' }
						{ formatShortDate( nextPlan.start_date ) }
					</span>
				</div>
			) }
		</>
	);
}
