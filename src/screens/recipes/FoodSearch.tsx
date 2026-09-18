import { useRef, useState } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import { alertDialog } from '../../utils/confirmDialog';
import Button from '../../components/ui/Button';
import Chip from '../../components/ui/Chip';
import { STORE_NAME as CUSTOM_FOODS_STORE } from '../../store/customFoods';
import styles from './FoodSearch.module.css';
import type {
	CustomFood,
	FoodSearchResponse,
	FoodSearchResult,
	ResolvedFood,
} from '../../types';

interface FoodSearchProps {
	onResolve: ( food: ResolvedFood ) => void;
}

interface CustomFoodsStoreSelectors {
	getCustomFoods: () => CustomFood[];
}

const DEBOUNCE_MS = 400;

export default function FoodSearch( { onResolve }: FoodSearchProps ) {
	const [ tab, setTab ] = useState< 'usda' | 'custom' >( 'usda' );

	return (
		<>
			<div className={ styles.tabs }>
				<button
					type="button"
					className={ `${ styles.tab } ${
						tab === 'usda' ? styles.isActive : ''
					}`.trim() }
					onClick={ () => setTab( 'usda' ) }
				>
					{ __( 'USDA', 'nutrio' ) }
				</button>
				<button
					type="button"
					className={ `${ styles.tab } ${
						tab === 'custom' ? styles.isActive : ''
					}`.trim() }
					onClick={ () => setTab( 'custom' ) }
				>
					{ __( 'My custom foods', 'nutrio' ) }
				</button>
			</div>

			{ tab === 'usda' ? (
				<UsdaSearch onResolve={ onResolve } />
			) : (
				<CustomFoodSearch onResolve={ onResolve } />
			) }
		</>
	);
}

function UsdaSearch( { onResolve }: FoodSearchProps ) {
	const [ query, setQuery ] = useState( '' );
	const [ includeBranded, setIncludeBranded ] = useState( false );
	const [ results, setResults ] = useState< FoodSearchResult[] >( [] );
	const [ page, setPage ] = useState( 1 );
	const [ hasMore, setHasMore ] = useState( false );
	const [ isSearching, setIsSearching ] = useState( false );
	const [ isLoadingMore, setIsLoadingMore ] = useState( false );
	const [ resolvingId, setResolvingId ] = useState< number | null >( null );
	const debounceRef = useRef< ReturnType< typeof setTimeout > >();
	// A query typed character-by-character fires several debounced
	// searches; their responses can come back out of order (a shorter,
	// earlier query's request can resolve after a later, longer one's).
	// Aborting the previous request before starting a new one — rather
	// than just overwriting whichever response lands last — is what
	// actually prevents a stale response from clobbering the current one.
	const abortRef = useRef< AbortController | null >();

	const runSearch = async (
		value: string,
		withBranded: boolean,
		targetPage: number,
		append: boolean
	) => {
		abortRef.current?.abort();

		if ( ! value.trim() ) {
			setResults( [] );
			setHasMore( false );
			return;
		}

		const controller = new AbortController();
		abortRef.current = controller;

		if ( append ) {
			setIsLoadingMore( true );
		} else {
			setIsSearching( true );
		}

		try {
			const response: FoodSearchResponse = await apiFetch( {
				path: `/nutrio/v1/foods/search?query=${ encodeURIComponent(
					value
				) }&page=${ targetPage }${
					withBranded ? '&include_branded=1' : ''
				}`,
				signal: controller.signal,
			} );

			setResults( ( prev ) =>
				append ? [ ...prev, ...response.items ] : response.items
			);
			setHasMore( response.has_more );
			setPage( targetPage );
		} catch ( error ) {
			if ( ( error as { name?: string } )?.name === 'AbortError' ) {
				return; // Superseded by a newer search — not a real failure.
			}

			const message =
				error &&
				typeof error === 'object' &&
				'message' in error &&
				typeof error.message === 'string'
					? error.message
					: __( 'Something went wrong searching.', 'nutrio' );

			await alertDialog( { message } );
		} finally {
			if ( abortRef.current === controller ) {
				setIsSearching( false );
				setIsLoadingMore( false );
			}
		}
	};

	const handleChange = ( event: React.ChangeEvent< HTMLInputElement > ) => {
		const value = event.target.value;
		setQuery( value );

		clearTimeout( debounceRef.current );
		debounceRef.current = setTimeout(
			() => runSearch( value, includeBranded, 1, false ),
			DEBOUNCE_MS
		);
	};

	const handleIncludeBrandedChange = (
		event: React.ChangeEvent< HTMLInputElement >
	) => {
		const checked = event.target.checked;
		setIncludeBranded( checked );
		runSearch( query, checked, 1, false );
	};

	const handleLoadMore = () => {
		runSearch( query, includeBranded, page + 1, true );
	};

	const handleSelect = async ( fdcId: number ) => {
		setResolvingId( fdcId );

		try {
			const food: ResolvedFood = await apiFetch( {
				path: `/nutrio/v1/foods/${ fdcId }/resolve`,
				method: 'POST',
			} );
			onResolve( food );
		} catch ( error ) {
			// apiFetch rejects with the REST API's error envelope
			// ({code, message, data}), not a native Error — most likely
			// here: this food can't be reliably converted to a per-100g
			// profile (a non-gram serving size, or USDA reported no
			// identifiable nutrient values for it).
			const message =
				error &&
				typeof error === 'object' &&
				'message' in error &&
				typeof error.message === 'string'
					? error.message
					: __( 'Something went wrong adding this food.', 'nutrio' );

			await alertDialog( { message } );
		} finally {
			setResolvingId( null );
		}
	};

	return (
		<>
			<div className="nutrio-field" style={ { marginBottom: '8px' } }>
				<input
					type="text"
					value={ query }
					onChange={ handleChange }
					placeholder={ __( 'Search ingredient…', 'nutrio' ) }
				/>
			</div>

			<label
				htmlFor="nutrio-include-branded"
				style={ {
					display: 'flex',
					alignItems: 'center',
					gap: '6px',
					fontSize: '12px',
					color: 'var(--ink-muted)',
					marginBottom: '12px',
				} }
			>
				<input
					id="nutrio-include-branded"
					type="checkbox"
					checked={ includeBranded }
					onChange={ handleIncludeBrandedChange }
				/>
				{ __( 'Include branded products', 'nutrio' ) }
			</label>

			{ isSearching && (
				<p style={ { fontSize: '12.5px', color: 'var(--ink-muted)' } }>
					{ __( 'Searching…', 'nutrio' ) }
				</p>
			) }

			{ ! isSearching && query && results.length === 0 && (
				<p style={ { fontSize: '12.5px', color: 'var(--ink-muted)' } }>
					{ __( 'No matches.', 'nutrio' ) }
				</p>
			) }

			{ results.map( ( food ) => (
				<button
					key={ food.fdcId }
					className={ styles.result }
					onClick={ () => handleSelect( food.fdcId ) }
					disabled={ resolvingId !== null }
				>
					<div>
						<div className={ styles.name }>
							{ food.description }
						</div>
						<div className={ styles.meta }>{ food.dataType }</div>
					</div>
					<Chip
						tone={ food.dataType === 'Branded' ? 'clay' : 'sage' }
					>
						{ chipLabel( food, resolvingId ) }
					</Chip>
				</button>
			) ) }

			{ hasMore && (
				<Button
					variant="ghost"
					onClick={ handleLoadMore }
					disabled={ isLoadingMore }
					style={ {
						width: '100%',
						justifyContent: 'center',
						marginBottom: '8px',
					} }
				>
					{ isLoadingMore
						? __( 'Loading…', 'nutrio' )
						: __( 'Load more', 'nutrio' ) }
				</Button>
			) }

			<p className="nutrio-field-hint" style={ { marginTop: '8px' } }>
				{ __(
					"Branded (manufacturer-supplied) products are hidden by default — some report their serving size in a way that can't be reliably added to a recipe. Foundation & SR Legacy always work.",
					'nutrio'
				) }
			</p>
		</>
	);
}

function chipLabel(
	food: FoodSearchResult,
	resolvingId: number | null
): string {
	if ( resolvingId === food.fdcId ) {
		return __( 'Adding…', 'nutrio' );
	}

	return food.dataType === 'Branded'
		? __( 'Branded', 'nutrio' )
		: __( 'USDA', 'nutrio' );
}

function CustomFoodSearch( { onResolve }: FoodSearchProps ) {
	const [ query, setQuery ] = useState( '' );

	const foods = useSelect( ( select ) => {
		const store = select(
			CUSTOM_FOODS_STORE
		) as unknown as CustomFoodsStoreSelectors;

		return store.getCustomFoods();
	}, [] );

	const filtered = query.trim()
		? foods.filter( ( food ) =>
				food.name.toLowerCase().includes( query.trim().toLowerCase() )
		  )
		: foods;

	const handleSelect = ( food: CustomFood ) => {
		onResolve( {
			id: food.id,
			source: 'custom',
			source_id: food.id,
			description: food.name,
			data_type: 'Custom',
			nutrients: food.nutrients,
		} );
	};

	return (
		<>
			<div className="nutrio-field" style={ { marginBottom: '12px' } }>
				<input
					type="text"
					value={ query }
					onChange={ ( event ) => setQuery( event.target.value ) }
					placeholder={ __( 'Search your custom foods…', 'nutrio' ) }
				/>
			</div>

			{ filtered.length === 0 && (
				<p style={ { fontSize: '12.5px', color: 'var(--ink-muted)' } }>
					{ foods.length === 0
						? __(
								'No custom foods yet — add one from the Food database screen.',
								'nutrio'
						  )
						: __( 'No matches.', 'nutrio' ) }
				</p>
			) }

			{ filtered.map( ( food ) => (
				<button
					key={ food.id }
					className={ styles.result }
					onClick={ () => handleSelect( food ) }
				>
					<div>
						<div className={ styles.name }>{ food.name }</div>
					</div>
					<Chip tone="clay">{ __( 'Custom', 'nutrio' ) }</Chip>
				</button>
			) ) }
		</>
	);
}
