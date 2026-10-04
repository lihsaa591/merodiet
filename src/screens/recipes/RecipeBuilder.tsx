import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import Button from '../../components/ui/Button';
import Panel, { PanelBody, PanelHead } from '../../components/ui/Panel';
import UnsavedBadge from '../../components/ui/UnsavedBadge';
import FoodSearch from './FoodSearch';
import styles from './RecipeBuilder.module.css';
import { useGlobalDirtyState } from '../../hooks/useGlobalDirtyState';
import { confirmDialog } from '../../utils/confirmDialog';
import { errorMessage, toast } from '../../utils/toast';
import {
	estimateNutrientsPerServing,
	formatAmount,
	listExtraNutrients,
} from '../../utils/nutrients';
import type { Recipe, RecipeInput, ResolvedFood } from '../../types';

interface DraftItem {
	food_id: number;
	quantity_grams: number;
	food_description: string | null;
	nutrients: ResolvedFood[ 'nutrients' ];
}

interface RecipeBuilderProps {
	recipe: Recipe | null;
	onSave: ( data: RecipeInput ) => Promise< void >;
	onCancel: () => void;
}

export default function RecipeBuilder( {
	recipe,
	onSave,
	onCancel,
}: RecipeBuilderProps ) {
	const [ name, setName ] = useState( recipe?.name ?? '' );
	const [ servings, setServings ] = useState( recipe?.servings ?? 1 );
	const [ items, setItems ] = useState< DraftItem[] >(
		() =>
			recipe?.items.map( ( item ) => ( {
				food_id: item.food_id,
				quantity_grams: item.quantity_grams,
				food_description: item.food_description,
				nutrients: item.nutrients,
			} ) ) ?? []
	);
	const [ isSaving, setIsSaving ] = useState( false );
	const { isDirty, markClean } = useGlobalDirtyState( {
		name,
		servings,
		items,
	} );

	const addItem = ( food: ResolvedFood ) => {
		setItems( ( prev ) => [
			...prev,
			{
				food_id: food.id,
				quantity_grams: 100,
				food_description: food.description,
				nutrients: food.nutrients,
			},
		] );
	};

	const removeItem = ( index: number ) => {
		setItems( ( prev ) => prev.filter( ( _, i ) => i !== index ) );
	};

	const setItemQuantity = ( index: number, quantity: number ) => {
		setItems( ( prev ) =>
			prev.map( ( item, i ) =>
				i === index ? { ...item, quantity_grams: quantity } : item
			)
		);
	};

	const handleSave = async () => {
		setIsSaving( true );

		try {
			await onSave( {
				name,
				servings,
				items: items.map( ( item ) => ( {
					food_id: item.food_id,
					quantity_grams: item.quantity_grams,
				} ) ),
			} );
			markClean();
		} catch ( error ) {
			toast.error(
				errorMessage(
					error,
					__( 'Could not save this recipe.', 'nutrio' )
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
				message: __( 'Discard unsaved changes?', 'nutrio' ),
				confirmLabel: __( 'Discard', 'nutrio' ),
				destructive: true,
			} ) )
		) {
			onCancel();
		}
	};

	// Live estimate from the current draft — updates instantly as ingredients
	// change, ahead of the authoritative totals the server computes on save.
	const summary = estimateNutrientsPerServing( items, servings );
	// Only whichever of fiber/sodium/vitamins/etc. the current ingredients
	// actually report — not every food has every one of these.
	const extraNutrients = listExtraNutrients( summary );

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
					<h1>
						{ recipe ? recipe.name : __( 'New recipe', 'nutrio' ) }
					</h1>
					{ isDirty && <UnsavedBadge /> }
				</div>
				<div style={ { display: 'flex', gap: '10px' } }>
					<Button
						variant="ghost"
						onClick={ handleCancel }
						disabled={ isSaving }
					>
						{ __( 'Cancel', 'nutrio' ) }
					</Button>
					<Button
						variant="primary"
						onClick={ handleSave }
						disabled={ isSaving || ! name || items.length === 0 }
					>
						{ recipe
							? __( 'Save changes', 'nutrio' )
							: __( 'Create recipe', 'nutrio' ) }
					</Button>
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
								<label htmlFor="nutrio-recipe-name">
									{ __( 'Recipe name', 'nutrio' ) }
								</label>
								<input
									id="nutrio-recipe-name"
									type="text"
									value={ name }
									onChange={ ( e ) =>
										setName( e.target.value )
									}
									placeholder={ __(
										'e.g. Lentil & Roast Vegetable Bowl',
										'nutrio'
									) }
								/>
							</div>
							<div className="nutrio-field">
								<label htmlFor="nutrio-recipe-servings">
									{ __( 'Servings', 'nutrio' ) }
								</label>
								<input
									id="nutrio-recipe-servings"
									type="number"
									min={ 1 }
									value={ servings }
									onChange={ ( e ) =>
										setServings(
											Math.max(
												1,
												Number( e.target.value ) || 1
											)
										)
									}
								/>
							</div>
						</div>

						<div className={ styles.ingredientHeader }>
							<div>{ __( 'Ingredient', 'nutrio' ) }</div>
							<div>{ __( 'Qty (g)', 'nutrio' ) }</div>
							<div>{ __( 'Food', 'nutrio' ) }</div>
							<div></div>
						</div>

						{ items.length === 0 && (
							<p
								style={ {
									fontSize: '12.5px',
									color: 'var(--ink-muted)',
									padding: '10px 0',
								} }
							>
								{ __(
									'No ingredients yet — search for one on the right to add it.',
									'nutrio'
								) }
							</p>
						) }

						{ items.map( ( item, index ) => (
							<div
								className={ styles.ingredientRow }
								key={ index }
							>
								<div>
									{ item.food_description ??
										__( '(unknown food)', 'nutrio' ) }
								</div>
								<input
									className={ styles.qtyInput }
									type="number"
									min={ 0 }
									value={ item.quantity_grams }
									onChange={ ( e ) =>
										setItemQuantity(
											index,
											Number( e.target.value ) || 0
										)
									}
								/>
								<div
									className="nutrio-mono"
									style={ {
										fontSize: '12px',
										color: 'var(--ink-faint)',
									} }
								>
									{ __( 'g', 'nutrio' ) }
								</div>
								<button
									className={ styles.removeBtn }
									onClick={ () => removeItem( index ) }
									aria-label={ __(
										'Remove ingredient',
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
							</div>
						) ) }

						<div style={ { marginTop: '16px' } }>
							<h3
								style={ {
									fontSize: '14px',
									fontWeight: 700,
									marginBottom: '10px',
								} }
							>
								{ __( 'Per serving', 'nutrio' ) }
							</h3>
							{ items.length === 0 && (
								<p
									style={ {
										fontSize: '12px',
										color: 'var(--ink-faint)',
									} }
								>
									{ __(
										'Add an ingredient to see estimated totals.',
										'nutrio'
									) }
								</p>
							) }
							{ items.length > 0 && (
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
							) }
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

				<Panel>
					<PanelHead>
						<h3>{ __( 'Search foods', 'nutrio' ) }</h3>
					</PanelHead>
					<PanelBody>
						<FoodSearch onResolve={ addItem } />
					</PanelBody>
				</Panel>
			</div>
		</>
	);
}
