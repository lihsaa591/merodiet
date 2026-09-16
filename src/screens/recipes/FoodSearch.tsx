import { useRef, useState } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import Chip from '../../components/ui/Chip';
import { STORE_NAME as CUSTOM_FOODS_STORE } from '../../store/customFoods';
import styles from './FoodSearch.module.css';
import type { CustomFood, FoodSearchResult, ResolvedFood } from '../../types';

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
	const [ results, setResults ] = useState< FoodSearchResult[] >( [] );
	const [ isSearching, setIsSearching ] = useState( false );
	const [ resolvingId, setResolvingId ] = useState< number | null >( null );
	const debounceRef = useRef< ReturnType< typeof setTimeout > >();

	const runSearch = async ( value: string ) => {
		if ( ! value.trim() ) {
			setResults( [] );
			return;
		}

		setIsSearching( true );

		try {
			const found: FoodSearchResult[] = await apiFetch( {
				path: `/nutrio/v1/foods/search?query=${ encodeURIComponent(
					value
				) }`,
			} );
			setResults( found );
		} finally {
			setIsSearching( false );
		}
	};

	const handleChange = ( event: React.ChangeEvent< HTMLInputElement > ) => {
		const value = event.target.value;
		setQuery( value );

		clearTimeout( debounceRef.current );
		debounceRef.current = setTimeout(
			() => runSearch( value ),
			DEBOUNCE_MS
		);
	};

	const handleSelect = async ( fdcId: number ) => {
		setResolvingId( fdcId );

		try {
			const food: ResolvedFood = await apiFetch( {
				path: `/nutrio/v1/foods/${ fdcId }/resolve`,
				method: 'POST',
			} );
			onResolve( food );
		} finally {
			setResolvingId( null );
		}
	};

	return (
		<>
			<div className="nutrio-field" style={ { marginBottom: '12px' } }>
				<input
					type="text"
					value={ query }
					onChange={ handleChange }
					placeholder={ __( 'Search ingredient…', 'nutrio' ) }
				/>
			</div>

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

			<p className="nutrio-field-hint" style={ { marginTop: '8px' } }>
				{ __(
					'Foundation & SR Legacy report per 100g and are preferred for clinical accuracy over manufacturer-supplied Branded values.',
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
