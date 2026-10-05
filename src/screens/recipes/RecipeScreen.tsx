import { useSelect, useDispatch } from '@wordpress/data';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useQueryParam } from '../../hooks/useQueryParam';
import { usePagination } from '../../hooks/usePagination';
import { useShowFilters } from '../../hooks/useShowFilters';
import { STORE_NAME } from '../../store/recipes';
import { confirmDialog } from '../../utils/confirmDialog';
import { errorMessage, reportBulkResult, toast } from '../../utils/toast';
import RecipeLibrary from './RecipeLibrary';
import RecipeBuilder from './RecipeBuilder';
import type { Recipe, RecipeInput } from '../../types';

interface RecipesStoreSelectors {
	getRecipesPage: (
		page: number,
		perPage: number,
		filters: Record< string, string >
	) => Recipe[];
	getRecipesTotal: () => number;
	getRecipesTotalPages: () => number;
	getRecipe: ( id: number ) => Recipe | null;
	hasFinishedResolution: ( selector: string, args?: unknown[] ) => boolean;
}

const RECIPE_FILTER_DEFAULTS = { search: '' };

export default function RecipeScreen() {
	// `id` in the URL is what makes an open recipe deep-linkable and
	// refresh-safe — "new" for an unsaved recipe, a numeric id once saved.
	const [ idParam, setIdParam ] = useQueryParam( 'id' );
	const { page, perPage, filters, setPage, setPerPage, setFilter } =
		usePagination( 'recipes', { filterDefaults: RECIPE_FILTER_DEFAULTS } );

	const editingId = idParam && idParam !== 'new' ? Number( idParam ) : null;

	const {
		recipes,
		total,
		totalPages,
		isLoading,
		editingRecipe,
		isEditingRecipeLoading,
	} = useSelect(
		( select ) => {
			const store = select(
				STORE_NAME
			) as unknown as RecipesStoreSelectors;

			return {
				recipes: store.getRecipesPage( page, perPage, filters ),
				total: store.getRecipesTotal(),
				totalPages: store.getRecipesTotalPages(),
				isLoading: ! store.hasFinishedResolution( 'getRecipesPage', [
					page,
					perPage,
					filters,
				] ),
				editingRecipe:
					editingId !== null ? store.getRecipe( editingId ) : null,
				isEditingRecipeLoading:
					editingId !== null &&
					! store.hasFinishedResolution( 'getRecipe', [ editingId ] ),
			};
		},
		[ editingId, page, perPage, filters ]
	);

	const isFiltering = Boolean( filters.search );
	const showFilters = useShowFilters( total, isFiltering );

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

	const openAdd = () => setIdParam( 'new' );
	const openEdit = ( id: number ) => setIdParam( String( id ) );
	const backToList = () => setIdParam( null );

	const handleSave = async ( data: RecipeInput ) => {
		if ( editingRecipe ) {
			await updateRecipe( editingRecipe.id, data );
			toast.success( __( 'Recipe saved.', 'merodiet' ) );
		} else {
			const created = await createRecipe( data );
			toast.success( __( 'Recipe created.', 'merodiet' ) );
			setIdParam( String( created.id ) );
			return;
		}
		backToList();
	};

	const handleDelete = async ( recipe: Recipe ) => {
		const confirmed = await confirmDialog( {
			message: __(
				'Remove this recipe? This cannot be undone.',
				'merodiet'
			),
			confirmLabel: __( 'Remove', 'merodiet' ),
			destructive: true,
		} );
		if ( ! confirmed ) {
			return;
		}

		try {
			await deleteRecipe( recipe.id );
			toast.success( __( 'Recipe removed.', 'merodiet' ) );
		} catch ( error ) {
			toast.error(
				errorMessage(
					error,
					__( 'Could not remove this recipe.', 'merodiet' )
				)
			);
		}
	};

	const handleBulkDelete = async ( selected: Recipe[] ) => {
		const confirmed = await confirmDialog( {
			message: sprintf(
				/* translators: %d: number of recipes being removed */
				__(
					'Remove %d selected recipe(s)? This cannot be undone.',
					'merodiet'
				),
				selected.length
			),
			confirmLabel: __( 'Remove', 'merodiet' ),
			destructive: true,
		} );
		if ( confirmed ) {
			const results = await Promise.allSettled(
				selected.map( ( r ) => deleteRecipe( r.id ) )
			);
			reportBulkResult( results, {
				success: ( count ) =>
					sprintf(
						/* translators: %d: number of recipes removed */
						_n(
							'%d recipe removed.',
							'%d recipes removed.',
							count,
							'merodiet'
						),
						count
					),
				failure: __( 'Some recipes could not be removed.', 'merodiet' ),
			} );
		}
	};

	if ( idParam !== null ) {
		if (
			isEditingRecipeLoading ||
			( editingId !== null && ! editingRecipe )
		) {
			return <p>{ __( 'Loading…', 'merodiet' ) }</p>;
		}

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
			page={ page }
			totalPages={ totalPages }
			onPageChange={ setPage }
			total={ total }
			perPage={ perPage }
			onPerPageChange={ setPerPage }
			search={ filters.search }
			onSearchChange={ ( value ) => setFilter( 'search', value ) }
			showFilters={ showFilters }
			isFiltering={ isFiltering }
			onAdd={ openAdd }
			onEdit={ openEdit }
			onDelete={ handleDelete }
			onBulkDelete={ handleBulkDelete }
		/>
	);
}
