import { useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';
import Button from '../../components/ui/Button';
import Panel, { PanelBody, PanelHead } from '../../components/ui/Panel';
import UnsavedBadge from '../../components/ui/UnsavedBadge';
import { useGlobalDirtyState } from '../../hooks/useGlobalDirtyState';
import { confirmDialog } from '../../utils/confirmDialog';
import { errorMessage, toast } from '../../utils/toast';
import { formatShortDate } from '../../utils/date';
import ItemSearch from './ItemSearch';
import styles from './PlanBuilder.module.css';
import {
	estimateDayNutrients,
	formatAmount,
	listExtraNutrients,
	summarizeNutrients,
} from '../../utils/nutrients';
import type { NutrientSummary } from '../../utils/nutrients';
import type {
	MealType,
	Plan,
	PlanDayInput,
	PlanInput,
	PlanItem,
	PlanItemInput,
	Recipe,
	ResolvedFood,
} from '../../types';

const MEAL_TYPES: { id: MealType; label: string }[] = [
	{ id: 'breakfast', label: __( 'Breakfast', 'merodiet' ) },
	{ id: 'lunch', label: __( 'Lunch', 'merodiet' ) },
	{ id: 'dinner', label: __( 'Dinner', 'merodiet' ) },
	{ id: 'snack', label: __( 'Snack', 'merodiet' ) },
];

interface DraftItem extends PlanItemInput {
	label: string;
	nutrients: Record< string, { amount_per_100g: number } > | null;
	recipe_nutrient_totals_per_serving: Record< string, number > | null;
}

interface DraftDay {
	day_offset: number;
	items: DraftItem[];
}

interface PlanBuilderProps {
	plan: Plan | null;
	onSave: ( data: PlanInput ) => Promise< void >;
	onCancel: () => void;
	onAssignClick: () => void;
	onDuplicateClick: () => void;
	onUnassignClick: () => void;
}

// One draft day per date between start/end (inclusive) — see spec's "auto-generate from dates" decision.
function daysBetween( startDate: string, endDate: string ): number {
	const start = new Date( startDate );
	const end = new Date( endDate );
	const diffDays = Math.round(
		( end.getTime() - start.getTime() ) / ( 1000 * 60 * 60 * 24 )
	);
	return Math.max( 1, diffDays + 1 );
}

// Real day-by-day plans run a week or two, not months — this is a backstop
// against an accidental huge range, not a normal-use limit.
const MAX_PLAN_DAYS = 90;
const DAYS_PER_WEEK = 7;

function addDays( dateStr: string, days: number ): string {
	const date = new Date( dateStr );
	date.setDate( date.getDate() + days );
	return date.toISOString().slice( 0, 10 );
}

function draftItemFromApiItem( item: PlanItem ): DraftItem {
	return {
		meal_type: item.meal_type,
		food_id: item.food_id ?? undefined,
		recipe_id: item.recipe_id ?? undefined,
		quantity_grams: item.quantity_grams ?? undefined,
		servings: item.servings ?? undefined,
		label:
			item.food_description ??
			item.recipe_name ??
			__( '(unknown item)', 'merodiet' ),
		nutrients: item.nutrients,
		recipe_nutrient_totals_per_serving:
			item.recipe_nutrient_totals_per_serving,
	};
}

export default function PlanBuilder( {
	plan,
	onSave,
	onCancel,
	onAssignClick,
	onDuplicateClick,
	onUnassignClick,
}: PlanBuilderProps ) {
	const isReadOnly = plan?.status === 'assigned';

	const [ title, setTitle ] = useState( plan?.title ?? '' );
	const [ startDate, setStartDate ] = useState(
		plan?.start_date ?? new Date().toISOString().slice( 0, 10 )
	);
	const [ endDate, setEndDate ] = useState(
		plan?.end_date ?? new Date().toISOString().slice( 0, 10 )
	);
	const [ days, setDays ] = useState< DraftDay[] >( () => {
		if ( plan ) {
			return plan.days.map( ( day ) => ( {
				day_offset: day.day_offset,
				items: day.items.map( draftItemFromApiItem ),
			} ) );
		}
		return [ { day_offset: 0, items: [] } ];
	} );
	const [ activeDayOffset, setActiveDayOffset ] = useState( 0 );
	const [ addingTo, setAddingTo ] = useState< MealType | null >( null );
	const [ isSaving, setIsSaving ] = useState( false );
	const [ isCopyPanelOpen, setCopyPanelOpen ] = useState( false );
	const [ copyTargets, setCopyTargets ] = useState< Set< number > >(
		new Set()
	);

	const { isDirty, markClean } = useGlobalDirtyState( {
		title,
		startDate,
		endDate,
		days,
	} );

	// Regenerate day tabs from the date range, keeping items on days that still exist.
	const applyDateRange = async ( newStart: string, newEnd: string ) => {
		const count = daysBetween( newStart, newEnd );

		if ( count > MAX_PLAN_DAYS ) {
			toast.error(
				__(
					'Plans can’t span more than 90 days — for a longer program, build one plan per stretch and duplicate between them.',
					'merodiet'
				)
			);
			return;
		}

		const droppedItems = days.filter(
			( d ) => d.day_offset >= count && d.items.length > 0
		);

		if (
			droppedItems.length > 0 &&
			! ( await confirmDialog( {
				message: __(
					'Shortening the date range will remove items already added on the dropped days. Continue?',
					'merodiet'
				),
				confirmLabel: __( 'Continue', 'merodiet' ),
				destructive: true,
			} ) )
		) {
			return;
		}

		setDays( ( prev ) => {
			const next: DraftDay[] = [];
			for ( let offset = 0; offset < count; offset++ ) {
				next.push(
					prev.find( ( d ) => d.day_offset === offset ) ?? {
						day_offset: offset,
						items: [],
					}
				);
			}
			return next;
		} );

		setStartDate( newStart );
		setEndDate( newEnd );

		if ( activeDayOffset >= count ) {
			setActiveDayOffset( 0 );
		}
	};

	const activeDay =
		days.find( ( d ) => d.day_offset === activeDayOffset ) ?? days[ 0 ];

	// Beyond a week, a flat scrolling row of day tabs stops being usable —
	// group into weeks instead, showing only the active week's days below.
	const activeWeekIndex = Math.floor( activeDayOffset / DAYS_PER_WEEK );
	const weekCount = Math.ceil( days.length / DAYS_PER_WEEK );
	const visibleDays =
		days.length > DAYS_PER_WEEK
			? days.filter(
					( d ) =>
						Math.floor( d.day_offset / DAYS_PER_WEEK ) ===
						activeWeekIndex
			  )
			: days;

	const addFoodItem = ( food: ResolvedFood ) => {
		if ( ! addingTo ) {
			return;
		}
		setDays( ( prev ) =>
			prev.map( ( day ) =>
				day.day_offset === activeDayOffset
					? {
							...day,
							items: [
								...day.items,
								{
									meal_type: addingTo,
									food_id: food.id,
									quantity_grams: 100,
									label: food.description,
									nutrients: food.nutrients,
									recipe_nutrient_totals_per_serving: null,
								},
							],
					  }
					: day
			)
		);
		setAddingTo( null );
	};

	const addRecipeItem = ( recipe: Recipe ) => {
		if ( ! addingTo ) {
			return;
		}
		setDays( ( prev ) =>
			prev.map( ( day ) =>
				day.day_offset === activeDayOffset
					? {
							...day,
							items: [
								...day.items,
								{
									meal_type: addingTo,
									recipe_id: recipe.id,
									servings: 1,
									label: recipe.name,
									nutrients: null,
									recipe_nutrient_totals_per_serving:
										recipe.nutrient_totals_per_serving,
								},
							],
					  }
					: day
			)
		);
		setAddingTo( null );
	};

	const removeItem = ( mealType: MealType, index: number ) => {
		setDays( ( prev ) =>
			prev.map( ( day ) =>
				day.day_offset === activeDayOffset
					? {
							...day,
							items: day.items.filter(
								( item, i ) =>
									! (
										item.meal_type === mealType &&
										itemIndexWithinMeal(
											day.items,
											mealType,
											i
										) === index
									)
							),
					  }
					: day
			)
		);
	};

	// Items are stored in one flat array per day (matches the backend's
	// flat plan_items-per-plan_day shape) but rendered grouped by meal
	// type — this maps a row's position within its own meal-type group
	// back to its position in the flat array.
	function itemIndexWithinMeal(
		items: DraftItem[],
		mealType: MealType,
		flatIndex: number
	): number {
		let count = -1;
		for ( let i = 0; i <= flatIndex; i++ ) {
			if ( items[ i ].meal_type === mealType ) {
				count++;
			}
		}
		return count;
	}

	const setItemQuantity = (
		mealType: MealType,
		mealIndex: number,
		quantityGrams: number
	) => {
		setDays( ( prev ) =>
			prev.map( ( day ) => {
				if ( day.day_offset !== activeDayOffset ) {
					return day;
				}
				let seen = -1;
				return {
					...day,
					items: day.items.map( ( item ) => {
						if ( item.meal_type !== mealType ) {
							return item;
						}
						seen++;
						return seen === mealIndex
							? { ...item, quantity_grams: quantityGrams }
							: item;
					} ),
				};
			} )
		);
	};

	const setItemServings = (
		mealType: MealType,
		mealIndex: number,
		servings: number
	) => {
		setDays( ( prev ) =>
			prev.map( ( day ) => {
				if ( day.day_offset !== activeDayOffset ) {
					return day;
				}
				let seen = -1;
				return {
					...day,
					items: day.items.map( ( item ) => {
						if ( item.meal_type !== mealType ) {
							return item;
						}
						seen++;
						return seen === mealIndex
							? { ...item, servings }
							: item;
					} ),
				};
			} )
		);
	};

	const toggleCopyTarget = ( dayOffset: number ) => {
		setCopyTargets( ( prev ) => {
			const next = new Set( prev );
			if ( next.has( dayOffset ) ) {
				next.delete( dayOffset );
			} else {
				next.add( dayOffset );
			}
			return next;
		} );
	};

	const applyCopyToSelectedDays = async () => {
		if ( copyTargets.size === 0 || ! activeDay ) {
			setCopyPanelOpen( false );
			return;
		}

		const overwritesExisting = days.some(
			( day ) => copyTargets.has( day.day_offset ) && day.items.length > 0
		);

		if (
			overwritesExisting &&
			! ( await confirmDialog( {
				message: __(
					'This replaces any meals already on the selected day(s) with today’s meals. Continue?',
					'merodiet'
				),
				confirmLabel: __( 'Continue', 'merodiet' ),
				destructive: true,
			} ) )
		) {
			return;
		}

		setDays( ( prev ) =>
			prev.map( ( day ) =>
				copyTargets.has( day.day_offset )
					? {
							...day,
							items: activeDay.items.map( ( item ) => ( {
								...item,
							} ) ),
					  }
					: day
			)
		);
		setCopyTargets( new Set() );
		setCopyPanelOpen( false );
	};

	const handleSave = async () => {
		setIsSaving( true );
		try {
			const data: PlanInput = {
				title,
				start_date: startDate,
				end_date: endDate,
				days: days.map(
					( day ): PlanDayInput => ( {
						day_offset: day.day_offset,
						items: day.items.map( ( item ) => ( {
							meal_type: item.meal_type,
							food_id: item.food_id,
							recipe_id: item.recipe_id,
							quantity_grams: item.quantity_grams,
							servings: item.servings,
						} ) ),
					} )
				),
			};
			await onSave( data );
			markClean();
		} catch ( error ) {
			toast.error(
				errorMessage(
					error,
					__( 'Could not save this plan.', 'merodiet' )
				)
			);
		} finally {
			setIsSaving( false );
		}
	};

	const handleCancel = async () => {
		if (
			! isDirty ||
			( await confirmDialog( {
				message: __( 'Discard unsaved changes?', 'merodiet' ),
				confirmLabel: __( 'Discard', 'merodiet' ),
				destructive: true,
			} ) )
		) {
			onCancel();
		}
	};

	// An assigned plan's totals are a frozen snapshot keyed by day_offset —
	// never recomputed from in-memory items, unlike the live draft estimate.
	function computeLiveSummary(): NutrientSummary {
		if ( ! activeDay ) {
			return estimateDayNutrients( [] );
		}

		return estimateDayNutrients(
			activeDay.items.map( ( item ) =>
				item.food_id
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
					  }
			)
		);
	}

	const summary = isReadOnly
		? summarizeNutrients( plan?.nutrient_totals[ activeDayOffset ] ?? {} )
		: computeLiveSummary();
	const extraNutrients = listExtraNutrients( summary );

	return (
		<>
			<div className="merodiet-topbar">
				<div
					style={ {
						display: 'flex',
						alignItems: 'center',
						gap: '12px',
					} }
				>
					<h1>
						{ plan ? plan.title : __( 'New plan', 'merodiet' ) }
					</h1>
					{ isDirty && <UnsavedBadge /> }
					{ isReadOnly && (
						<span
							style={ {
								fontSize: '12px',
								color: 'var(--ink-muted)',
							} }
						>
							{ __( 'Assigned — read only', 'merodiet' ) }
						</span>
					) }
				</div>
				<div style={ { display: 'flex', gap: '10px' } }>
					<Button
						variant="ghost"
						onClick={ handleCancel }
						disabled={ isSaving }
					>
						{ isReadOnly
							? __( 'Back', 'merodiet' )
							: __( 'Cancel', 'merodiet' ) }
					</Button>
					{ ! isReadOnly && (
						<Button
							variant="primary"
							onClick={ handleSave }
							disabled={ isSaving || ! title }
						>
							{ plan
								? __( 'Save changes', 'merodiet' )
								: __( 'Create plan', 'merodiet' ) }
						</Button>
					) }
					{ ! isReadOnly && plan && (
						<Button
							variant="ghost"
							onClick={ onAssignClick }
							disabled={ isSaving || isDirty }
						>
							{ __( 'Assign to client', 'merodiet' ) }
						</Button>
					) }
					{ isReadOnly && (
						<Button variant="ghost" onClick={ onUnassignClick }>
							{ __( 'Unassign', 'merodiet' ) }
						</Button>
					) }
					{ isReadOnly && (
						<Button variant="primary" onClick={ onDuplicateClick }>
							{ __( 'Duplicate as new plan', 'merodiet' ) }
						</Button>
					) }
				</div>
			</div>

			<div className={ styles.grid }>
				<Panel>
					<PanelBody>
						<div
							className={ styles.nameRow }
							style={ { marginBottom: '16px' } }
						>
							<div className="merodiet-field">
								<label htmlFor="merodiet-plan-title">
									{ __( 'Plan title', 'merodiet' ) }
								</label>
								<input
									id="merodiet-plan-title"
									type="text"
									value={ title }
									onChange={ ( e ) =>
										setTitle( e.target.value )
									}
									disabled={ isReadOnly }
								/>
							</div>
							<div className="merodiet-field">
								<label htmlFor="merodiet-plan-start">
									{ __( 'Start date', 'merodiet' ) }
								</label>
								<input
									id="merodiet-plan-start"
									type="date"
									value={ startDate }
									onChange={ ( e ) =>
										applyDateRange(
											e.target.value,
											endDate
										)
									}
									disabled={ isReadOnly }
								/>
							</div>
							<div className="merodiet-field">
								<label htmlFor="merodiet-plan-end">
									{ __( 'End date', 'merodiet' ) }
								</label>
								<input
									id="merodiet-plan-end"
									type="date"
									value={ endDate }
									onChange={ ( e ) =>
										applyDateRange(
											startDate,
											e.target.value
										)
									}
									disabled={ isReadOnly }
								/>
							</div>
						</div>

						{ days.length > DAYS_PER_WEEK && (
							<div className={ styles.weekTabs }>
								{ Array.from( { length: weekCount } ).map(
									( _, weekIndex ) => (
										<button
											key={ weekIndex }
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
														startDate,
														weekIndex *
															DAYS_PER_WEEK
													)
												) }
											</span>
										</button>
									)
								) }
							</div>
						) }

						<div className={ styles.dayTabsRow }>
							<div className={ styles.dayTabs }>
								{ visibleDays.map( ( day ) => (
									<button
										key={ day.day_offset }
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
													startDate,
													day.day_offset
												)
											) }
										</span>
									</button>
								) ) }
							</div>

							{ ! isReadOnly && days.length > 1 && (
								<div className={ styles.copyWrap }>
									<button
										className={ styles.copyTrigger }
										aria-label={ __(
											'Repeat this day on other days',
											'merodiet'
										) }
										onClick={ () =>
											setCopyPanelOpen(
												( open ) => ! open
											)
										}
									>
										<CopyIcon />
										{ __( 'Repeat day', 'merodiet' ) }
									</button>

									{ isCopyPanelOpen && (
										<div className={ styles.copyPanel }>
											<div
												className={
													styles.copyPanelHead
												}
											>
												<span
													className={
														styles.copyPanelTitle
													}
												>
													{ sprintf(
														/* translators: %d: the day number (1-based) currently being copied */
														__(
															'Repeat Day %d on…',
															'merodiet'
														),
														activeDayOffset + 1
													) }
												</span>
												<div
													className={
														styles.copyPanelQuick
													}
												>
													<button
														onClick={ () =>
															setCopyTargets(
																new Set(
																	days
																		.filter(
																			(
																				day
																			) =>
																				day.day_offset !==
																				activeDayOffset
																		)
																		.map(
																			(
																				day
																			) =>
																				day.day_offset
																		)
																)
															)
														}
													>
														{ __(
															'All',
															'merodiet'
														) }
													</button>
													<button
														onClick={ () =>
															setCopyTargets(
																new Set()
															)
														}
													>
														{ __(
															'Clear',
															'merodiet'
														) }
													</button>
												</div>
											</div>

											<div
												className={
													styles.copyPanelChips
												}
											>
												{ days
													.filter(
														( day ) =>
															day.day_offset !==
															activeDayOffset
													)
													.map( ( day ) => (
														<button
															key={
																day.day_offset
															}
															className={ `${
																styles.copyChip
															} ${
																copyTargets.has(
																	day.day_offset
																)
																	? styles.isActive
																	: ''
															}`.trim() }
															onClick={ () =>
																toggleCopyTarget(
																	day.day_offset
																)
															}
														>
															{ __(
																'Day',
																'merodiet'
															) }{ ' ' }
															{ day.day_offset +
																1 }
														</button>
													) ) }
											</div>

											<div
												className={
													styles.copyPanelFoot
												}
											>
												<span
													className={
														styles.copyPanelCount
													}
												>
													{ sprintf(
														/* translators: %d: number of days selected to copy into */
														_n(
															'%d day selected',
															'%d days selected',
															copyTargets.size,
															'merodiet'
														),
														copyTargets.size
													) }
												</span>
												<div
													style={ {
														display: 'flex',
														gap: '8px',
													} }
												>
													<Button
														variant="ghost"
														onClick={ () => {
															setCopyPanelOpen(
																false
															);
															setCopyTargets(
																new Set()
															);
														} }
													>
														{ __(
															'Cancel',
															'merodiet'
														) }
													</Button>
													<Button
														variant="primary"
														onClick={
															applyCopyToSelectedDays
														}
														disabled={
															copyTargets.size ===
															0
														}
													>
														{ __(
															'Repeat',
															'merodiet'
														) }
													</Button>
												</div>
											</div>
										</div>
									) }
								</div>
							) }
						</div>

						{ MEAL_TYPES.map( ( meal ) => {
							const mealItems = ( activeDay?.items ?? [] ).filter(
								( item ) => item.meal_type === meal.id
							);

							return (
								<div
									key={ meal.id }
									className={ styles.mealSection }
								>
									<div className={ styles.mealHeader }>
										<h3>{ meal.label }</h3>
										{ ! isReadOnly && (
											<button
												className={ styles.addBtn }
												onClick={ () =>
													setAddingTo( meal.id )
												}
											>
												+ { __( 'Add', 'merodiet' ) }
											</button>
										) }
									</div>

									{ mealItems.length === 0 && (
										<p
											style={ {
												fontSize: '12px',
												color: 'var(--ink-faint)',
												padding: '6px 0',
											} }
										>
											{ __(
												'Nothing added yet.',
												'merodiet'
											) }
										</p>
									) }

									{ mealItems.map( ( item, index ) => (
										<div
											className={ styles.itemRow }
											key={ index }
										>
											<div>{ item.label }</div>
											{ item.food_id ? (
												<input
													className={
														styles.qtyInput
													}
													type="number"
													min={ 0 }
													value={
														item.quantity_grams ?? 0
													}
													onChange={ ( e ) =>
														setItemQuantity(
															meal.id,
															index,
															Number(
																e.target.value
															) || 0
														)
													}
													disabled={ isReadOnly }
												/>
											) : (
												<input
													className={
														styles.qtyInput
													}
													type="number"
													min={ 0 }
													step={ 0.5 }
													value={ item.servings ?? 0 }
													onChange={ ( e ) =>
														setItemServings(
															meal.id,
															index,
															Number(
																e.target.value
															) || 0
														)
													}
													disabled={ isReadOnly }
												/>
											) }
											<div
												className="merodiet-mono"
												style={ {
													fontSize: '12px',
													color: 'var(--ink-faint)',
												} }
											>
												{ item.food_id
													? __( 'g', 'merodiet' )
													: __( 'srv', 'merodiet' ) }
											</div>
											{ ! isReadOnly && (
												<button
													className={
														styles.removeBtn
													}
													onClick={ () =>
														removeItem(
															meal.id,
															index
														)
													}
													aria-label={ __(
														'Remove item',
														'merodiet'
													) }
												>
													<svg
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														strokeWidth="2"
													>
														<path d="M18 6 6 18M6 6l12 12" />
													</svg>
												</button>
											) }
										</div>
									) ) }
								</div>
							);
						} ) }

						<div style={ { marginTop: '16px' } }>
							<h3
								style={ {
									fontSize: '14px',
									fontWeight: 700,
									marginBottom: '10px',
								} }
							>
								{ __( 'Day totals', 'merodiet' ) }
							</h3>
							<div className={ styles.nutrientGrid }>
								<div className={ styles.nutrientTile }>
									<div className={ styles.nutrientVal }>
										{ formatAmount(
											summary.kcal,
											' kcal'
										) }
									</div>
									<div className={ styles.nutrientLbl }>
										{ __( 'Kcal', 'merodiet' ) }
									</div>
								</div>
								<div className={ styles.nutrientTile }>
									<div className={ styles.nutrientVal }>
										{ formatAmount( summary.protein ) }
									</div>
									<div className={ styles.nutrientLbl }>
										{ __( 'Protein', 'merodiet' ) }
									</div>
								</div>
								<div className={ styles.nutrientTile }>
									<div className={ styles.nutrientVal }>
										{ formatAmount( summary.carbs ) }
									</div>
									<div className={ styles.nutrientLbl }>
										{ __( 'Carbs', 'merodiet' ) }
									</div>
								</div>
								<div className={ styles.nutrientTile }>
									<div className={ styles.nutrientVal }>
										{ formatAmount( summary.fat ) }
									</div>
									<div className={ styles.nutrientLbl }>
										{ __( 'Fat', 'merodiet' ) }
									</div>
								</div>
							</div>
							{ extraNutrients.length > 0 && (
								<div
									className={ styles.nutrientGrid }
									style={ { marginTop: '10px' } }
								>
									{ extraNutrients.map( ( nutrient ) => (
										<div
											className={ styles.nutrientTile }
											key={ nutrient.key }
										>
											<div
												className={ styles.nutrientVal }
											>
												{ formatAmount(
													nutrient.value,
													` ${ nutrient.unit }`
												) }
											</div>
											<div
												className={ styles.nutrientLbl }
											>
												{ nutrient.label }
											</div>
										</div>
									) ) }
								</div>
							) }
						</div>
					</PanelBody>
				</Panel>

				{ ! isReadOnly && (
					<Panel>
						<PanelHead>
							<h3>
								{ addingTo
									? __( 'Add to', 'merodiet' ) +
									  ' ' +
									  MEAL_TYPES.find(
											( m ) => m.id === addingTo
									  )?.label
									: __( 'Select a meal slot', 'merodiet' ) }
							</h3>
						</PanelHead>
						<PanelBody>
							{ addingTo ? (
								<ItemSearch
									onSelectFood={ addFoodItem }
									onSelectRecipe={ addRecipeItem }
								/>
							) : (
								<p
									style={ {
										fontSize: '12.5px',
										color: 'var(--ink-muted)',
									} }
								>
									{ __(
										'Click "+ Add" on a meal above to search for a food or recipe.',
										'merodiet'
									) }
								</p>
							) }
						</PanelBody>
					</Panel>
				) }
			</div>
		</>
	);
}

function CopyIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		>
			<rect x="9" y="9" width="12" height="12" rx="2" />
			<path d="M5 15V5a2 2 0 0 1 2-2h10" />
		</svg>
	);
}
