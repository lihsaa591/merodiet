import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import Button from '../../components/ui/Button';
import Panel, { PanelBody, PanelHead } from '../../components/ui/Panel';
import UnsavedBadge from '../../components/ui/UnsavedBadge';
import { useGlobalDirtyState } from '../../hooks/useGlobalDirtyState';
import ItemSearch from './ItemSearch';
import styles from './PlanBuilder.module.css';
import { estimateDayNutrients, formatAmount } from '../../utils/nutrients';
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
	{ id: 'breakfast', label: __( 'Breakfast', 'nutrio' ) },
	{ id: 'lunch', label: __( 'Lunch', 'nutrio' ) },
	{ id: 'dinner', label: __( 'Dinner', 'nutrio' ) },
	{ id: 'snack', label: __( 'Snack', 'nutrio' ) },
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
			__( '(unknown item)', 'nutrio' ),
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

	const { isDirty, markClean } = useGlobalDirtyState( {
		title,
		startDate,
		endDate,
		days,
	} );

	// Regenerate day tabs from the date range, keeping items on days that still exist.
	const applyDateRange = ( newStart: string, newEnd: string ) => {
		const count = daysBetween( newStart, newEnd );
		const droppedItems = days.filter(
			( d ) => d.day_offset >= count && d.items.length > 0
		);

		if (
			droppedItems.length > 0 &&
			// eslint-disable-next-line no-alert
			! window.confirm(
				__(
					'Shortening the date range will remove items already added on the dropped days. Continue?',
					'nutrio'
				)
			)
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
		} finally {
			setIsSaving( false );
		}
	};

	const handleCancel = () => {
		if (
			! isDirty ||
			// eslint-disable-next-line no-alert
			window.confirm( __( 'Discard unsaved changes?', 'nutrio' ) )
		) {
			onCancel();
		}
	};

	const summary = activeDay
		? estimateDayNutrients(
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
									item.recipe_nutrient_totals_per_serving ??
									{},
						  }
				)
		  )
		: { kcal: null, protein: null, carbs: null, fat: null };

	return (
		<>
			<div className="nutrio-topbar">
				<div
					style={ {
						display: 'flex',
						alignItems: 'center',
						gap: '12px',
					} }
				>
					<h1>{ plan ? plan.title : __( 'New plan', 'nutrio' ) }</h1>
					{ isDirty && <UnsavedBadge /> }
					{ isReadOnly && (
						<span
							style={ {
								fontSize: '12px',
								color: 'var(--ink-muted)',
							} }
						>
							{ __( 'Assigned — read only', 'nutrio' ) }
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
							? __( 'Back', 'nutrio' )
							: __( 'Cancel', 'nutrio' ) }
					</Button>
					{ ! isReadOnly && (
						<Button
							variant="primary"
							onClick={ handleSave }
							disabled={ isSaving || ! title }
						>
							{ plan
								? __( 'Save changes', 'nutrio' )
								: __( 'Create plan', 'nutrio' ) }
						</Button>
					) }
					{ ! isReadOnly && plan && (
						<Button
							variant="ghost"
							onClick={ onAssignClick }
							disabled={ isSaving || isDirty }
						>
							{ __( 'Assign to client', 'nutrio' ) }
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
							<div className="nutrio-field">
								<label htmlFor="nutrio-plan-title">
									{ __( 'Plan title', 'nutrio' ) }
								</label>
								<input
									id="nutrio-plan-title"
									type="text"
									value={ title }
									onChange={ ( e ) =>
										setTitle( e.target.value )
									}
									disabled={ isReadOnly }
								/>
							</div>
							<div className="nutrio-field">
								<label htmlFor="nutrio-plan-start">
									{ __( 'Start date', 'nutrio' ) }
								</label>
								<input
									id="nutrio-plan-start"
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
							<div className="nutrio-field">
								<label htmlFor="nutrio-plan-end">
									{ __( 'End date', 'nutrio' ) }
								</label>
								<input
									id="nutrio-plan-end"
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

						<div className={ styles.dayTabs }>
							{ days.map( ( day ) => (
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
									{ __( 'Day', 'nutrio' ) }{ ' ' }
									{ day.day_offset + 1 }
									<span className={ styles.dayTabDate }>
										{ addDays( startDate, day.day_offset ) }
									</span>
								</button>
							) ) }
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
												+ { __( 'Add', 'nutrio' ) }
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
												'nutrio'
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
												className="nutrio-mono"
												style={ {
													fontSize: '12px',
													color: 'var(--ink-faint)',
												} }
											>
												{ item.food_id
													? __( 'g', 'nutrio' )
													: __( 'srv', 'nutrio' ) }
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
														'nutrio'
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
								{ __( 'Day totals', 'nutrio' ) }
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
										{ __( 'Kcal', 'nutrio' ) }
									</div>
								</div>
								<div className={ styles.nutrientTile }>
									<div className={ styles.nutrientVal }>
										{ formatAmount( summary.protein ) }
									</div>
									<div className={ styles.nutrientLbl }>
										{ __( 'Protein', 'nutrio' ) }
									</div>
								</div>
								<div className={ styles.nutrientTile }>
									<div className={ styles.nutrientVal }>
										{ formatAmount( summary.carbs ) }
									</div>
									<div className={ styles.nutrientLbl }>
										{ __( 'Carbs', 'nutrio' ) }
									</div>
								</div>
								<div className={ styles.nutrientTile }>
									<div className={ styles.nutrientVal }>
										{ formatAmount( summary.fat ) }
									</div>
									<div className={ styles.nutrientLbl }>
										{ __( 'Fat', 'nutrio' ) }
									</div>
								</div>
							</div>
						</div>
					</PanelBody>
				</Panel>

				{ ! isReadOnly && (
					<Panel>
						<PanelHead>
							<h3>
								{ addingTo
									? __( 'Add to', 'nutrio' ) +
									  ' ' +
									  MEAL_TYPES.find(
											( m ) => m.id === addingTo
									  )?.label
									: __( 'Select a meal slot', 'nutrio' ) }
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
										'nutrio'
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
