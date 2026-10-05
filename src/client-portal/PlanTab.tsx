import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import Panel, { PanelBody } from '../components/ui/Panel';
import Skeleton from '../components/ui/Skeleton';
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
	toEstimateInput,
	todaysDayOffset,
} from './mealMeta';
import NextPlanBanner from './NextPlanBanner';
import type { Plan, PlanDay, PlanItem } from '../types';
import styles from './PlanTab.module.css';

// Mirrors the practitioner Plan builder's own pagination: past a week,
// showing every day in one row gets unwieldy for a multi-month plan.
const DAYS_PER_WEEK = 7;

function addDays( dateStr: string, days: number ): string {
	const date = new Date( dateStr + 'T00:00:00' );
	date.setDate( date.getDate() + days );
	return date.toISOString().slice( 0, 10 );
}

function itemKcal( item: PlanItem ): number | null {
	return estimateDayNutrients( [ toEstimateInput( item ) ] ).kcal;
}

// Mirrors the loaded layout's rough shape (title, day tabs, a couple of
// meal groups, totals) so the page doesn't jump around once real data
// arrives — a plain "Loading…" line collapses to a fraction of the
// eventual height.
function PlanTabSkeleton() {
	return (
		<div>
			<Skeleton width="140px" height="22px" />
			<div style={ { marginTop: '8px', marginBottom: '18px' } }>
				<Skeleton width="180px" height="13px" />
			</div>
			<div className={ styles.dayTabs }>
				{ [ 0, 1, 2, 3, 4 ].map( ( index ) => (
					<Skeleton
						key={ index }
						shape="block"
						width="64px"
						height="52px"
					/>
				) ) }
			</div>
			{ [ 0, 1 ].map( ( meal ) => (
				<div key={ meal } className={ styles.meal }>
					<div style={ { marginBottom: '8px' } }>
						<Skeleton width="90px" height="15px" />
					</div>
					<div className={ styles.item }>
						<Skeleton width="55%" height="14px" />
					</div>
					<div className={ styles.item }>
						<Skeleton width="40%" height="14px" />
					</div>
				</div>
			) ) }
		</div>
	);
}

export default function PlanTab() {
	const [ plan, setPlan ] = useState< Plan | null | undefined >( undefined );
	const [ activeDayOffset, setActiveDayOffset ] = useState< number | null >(
		null
	);
	const [ isNutritionExpanded, setIsNutritionExpanded ] = useState( false );

	useEffect( () => {
		apiFetch< Plan | null >( { path: '/merodiet/v1/me/plan' } ).then(
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
			<div className="merodiet-topbar">
				<h1>{ __( 'My Plan', 'merodiet' ) }</h1>
			</div>
			<Panel>
				<PanelBody>
					{ undefined === plan && <PlanTabSkeleton /> }

					{ null === plan && (
						<p className={ styles.empty }>
							{ __(
								'No plan assigned yet — check back once your practitioner assigns one.',
								'merodiet'
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
											{ __( 'Week', 'merodiet' ) }{ ' ' }
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
										{ __( 'Day', 'merodiet' ) }{ ' ' }
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
												{ __( 'Today', 'merodiet' ) }
											</span>
										) }
									</button>
								) ) }
							</div>

							{ activeDay && activeDay.items.length === 0 && (
								<p className={ styles.empty }>
									{ __(
										'Nothing planned for this day.',
										'merodiet'
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
										{ __( 'Day total', 'merodiet' ) }
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
												{ __( 'Kcal', 'merodiet' ) }
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
												{ __( 'Protein', 'merodiet' ) }
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
												{ __( 'Carbs', 'merodiet' ) }
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
												{ __( 'Fat', 'merodiet' ) }
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
															'merodiet'
													  )
													: __(
															'Show full nutrition',
															'merodiet'
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

			<NextPlanBanner />
		</>
	);
}
