import { useState } from '@wordpress/element';
import { useSelect, useDispatch } from '@wordpress/data';
import { __ } from '@wordpress/i18n';
import { STORE_NAME } from '../../store/recipes';
import RecipeLibrary from './RecipeLibrary';
import RecipeBuilder from './RecipeBuilder';
import type { Recipe, RecipeInput } from '../../types';

interface RecipesStoreSelectors {
	getRecipes: () => Recipe[];
	hasFinishedResolution: ( selector: string ) => boolean;
}

export default function RecipeScreen() {
	const [ view, setView ] = useState< 'list' | 'builder' >( 'list' );
	const [ editingId, setEditingId ] = useState< number | null >( null );

	const { recipes, isLoading } = useSelect( ( select ) => {
		const store = select( STORE_NAME ) as unknown as RecipesStoreSelectors;

		return {
			recipes: store.getRecipes(),
			isLoading: ! store.hasFinishedResolution( 'getRecipes' ),
		};
	}, [] );

	const { createRecipe, updateRecipe, deleteRecipe } = useDispatch( STORE_NAME ) as {
		createRecipe: ( data: RecipeInput ) => Promise< Recipe >;
		updateRecipe: ( id: number, data: Partial< RecipeInput > ) => Promise< Recipe >;
		deleteRecipe: ( id: number ) => Promise< void >;
	};

	const editingRecipe = recipes.find( ( recipe ) => recipe.id === editingId ) ?? null;

	const openAdd = () => {
		setEditingId( null );
		setView( 'builder' );
	};

	const openEdit = ( id: number ) => {
		setEditingId( id );
		setView( 'builder' );
	};

	const backToList = () => setView( 'list' );

	const handleSave = async ( data: RecipeInput ) => {
		if ( editingRecipe ) {
			await updateRecipe( editingRecipe.id, data );
		} else {
			const created = await createRecipe( data );
			setEditingId( created.id );
			return;
		}
		backToList();
	};

	const handleDelete = ( recipe: Recipe ) => {
		// eslint-disable-next-line no-alert
		if ( window.confirm( __( 'Remove this recipe? This cannot be undone.', 'nutrio' ) ) ) {
			deleteRecipe( recipe.id );
		}
	};

	if ( view === 'builder' ) {
		return (
			<RecipeBuilder
				key={ editingId ?? 'new' }
				recipe={ editingRecipe }
				onSave={ handleSave }
				onCancel={ backToList }
			/>
		);
	}

	return (
		<RecipeLibrary
			recipes={ recipes }
			isLoading={ isLoading }
			onAdd={ openAdd }
			onEdit={ openEdit }
			onDelete={ handleDelete }
		/>
	);
}
