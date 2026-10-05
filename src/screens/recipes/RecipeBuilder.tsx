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
					__( 'Could not save this recipe.', 'merodiet' )
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

	// Live estimate from the current draft — updates instantly as ingredients
	// change, ahead of the authoritative totals the server computes on save.
	const summary = estimateNutrientsPerServing( items, servings );
	// Only whichever of fiber/sodium/vitamins/etc. the current ingredients
	// actually report — not every food has every one of these.
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
						{ recipe
							? recipe.name
							: __( 'New recipe', 'merodiet' ) }
					</h1>
					{ isDirty && <UnsavedBadge /> }
				</div>
				<div style={ { display: 'flex', gap: '10px' } }>
					<Button
						variant="ghost"
						onClick={ handleCancel }
						disabled={ isSaving }
					>
						{ __( 'Cancel', 'merodiet' ) }
					</Button>
					<Button
						variant="primary"
						onClick={ handleSave }
						disabled={ isSaving || ! name || items.length === 0 }
					>
						{ recipe
							? __( 'Save changes', 'merodiet' )
							: __( 'Create recipe', 'merodiet' ) }
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
							<div className="merodiet-field">
								<label htmlFor="merodiet-recipe-name">
									{ __( 'Recipe name', 'merodiet' ) }
								</label>
								<input
									id="merodiet-recipe-name"
									type="text"
									value={ name }
									onChange={ ( e ) =>
										setName( e.target.value )
									}
									placeholder={ __(
										'e.g. Lentil & Roast Vegetable Bowl',
										'merodiet'
									) }
								/>
							</div>
							<div className="merodiet-field">
								<label htmlFor="merodiet-recipe-servings">
									{ __( 'Servings', 'merodiet' ) }
								</label>
								<input
									id="merodiet-recipe-servings"
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
							<div>{ __( 'Ingredient', 'merodiet' ) }</div>
							<div>{ __( 'Qty (g)', 'merodiet' ) }</div>
							<div>{ __( 'Food', 'merodiet' ) }</div>
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
									'merodiet'
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
										__( '(unknown food)', 'merodiet' ) }
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
									className="merodiet-mono"
									style={ {
										fontSize: '12px',
										color: 'var(--ink-faint)',
									} }
								>
									{ __( 'g', 'merodiet' ) }
								</div>
								<button
									className={ styles.removeBtn }
									onClick={ () => removeItem( index ) }
									aria-label={ __(
										'Remove ingredient',
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
								{ __( 'Per serving', 'merodiet' ) }
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
										'merodiet'
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
						<h3>{ __( 'Search foods', 'merodiet' ) }</h3>
					</PanelHead>
					<PanelBody>
						<FoodSearch onResolve={ addItem } />
					</PanelBody>
				</Panel>
			</div>
		</>
	);
}
