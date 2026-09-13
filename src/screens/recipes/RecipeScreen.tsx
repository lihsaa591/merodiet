import { useSelect, useDispatch } from '@wordpress/data';
import { __, sprintf } from '@wordpress/i18n';
import { useQueryParam } from '../../hooks/useQueryParam';
import { STORE_NAME } from '../../store/recipes';
import { confirmDialog } from '../../utils/confirmDialog';
import RecipeLibrary from './RecipeLibrary';
import RecipeBuilder from './RecipeBuilder';
import type { Recipe, RecipeInput } from '../../types';

interface RecipesStoreSelectors {
	getRecipes: () => Recipe[];
	hasFinishedResolution: ( selector: string ) => boolean;
}

export default function RecipeScreen() {
	// `id` in the URL is what makes an open recipe deep-linkable and
	// refresh-safe — "new" for an unsaved recipe, a numeric id once saved.
	const [ idParam, setIdParam ] = useQueryParam( 'id' );

	const { recipes, isLoading } = useSelect( ( select ) => {
		const store = select( STORE_NAME ) as unknown as RecipesStoreSelectors;

		return {
			recipes: store.getRecipes(),
			isLoading: ! store.hasFinishedResolution( 'getRecipes' ),
		};
	}, [] );

	const { createRecipe, updateRecipe, deleteRecipe } = useDispatch(
		STORE_NAME
	) as {
		createRecipe: ( data: RecipeInput ) => Promise< Recipe >;
		updateRecipe: (
			id: number,
			data: Partial< RecipeInput >
		) => Promise< Recipe >;
		deleteRecipe: ( id: number ) => Promise< void >;
	};

	const editingId = idParam && idParam !== 'new' ? Number( idParam ) : null;
	const editingRecipe =
		recipes.find( ( recipe ) => recipe.id === editingId ) ?? null;

	const openAdd = () => setIdParam( 'new' );
	const openEdit = ( id: number ) => setIdParam( String( id ) );
	const backToList = () => setIdParam( null );

	const handleSave = async ( data: RecipeInput ) => {
		if ( editingRecipe ) {
			await updateRecipe( editingRecipe.id, data );
		} else {
			const created = await createRecipe( data );
			setIdParam( String( created.id ) );
			return;
		}
		backToList();
	};

	const handleDelete = async ( recipe: Recipe ) => {
		const confirmed = await confirmDialog( {
			message: __(
				'Remove this recipe? This cannot be undone.',
				'nutrio'
			),
			confirmLabel: __( 'Remove', 'nutrio' ),
			destructive: true,
		} );
		if ( confirmed ) {
			deleteRecipe( recipe.id );
		}
	};

	const handleBulkDelete = async ( selected: Recipe[] ) => {
		const confirmed = await confirmDialog( {
			message: sprintf(
				/* translators: %d: number of recipes being removed */
				__(
					'Remove %d selected recipe(s)? This cannot be undone.',
					'nutrio'
				),
				selected.length
			),
			confirmLabel: __( 'Remove', 'nutrio' ),
			destructive: true,
		} );
		if ( confirmed ) {
			await Promise.allSettled(
				selected.map( ( r ) => deleteRecipe( r.id ) )
			);
		}
	};

	if ( idParam !== null ) {
		return (
			<RecipeBuilder
				key={ idParam }
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
			onBulkDelete={ handleBulkDelete }
		/>
	);
}
