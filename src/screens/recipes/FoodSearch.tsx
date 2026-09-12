import { useRef, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import Chip from '../../components/ui/Chip';
import styles from './FoodSearch.module.css';
import type { FoodSearchResult, ResolvedFood } from '../../types';

interface FoodSearchProps {
	onResolve: ( food: ResolvedFood ) => void;
}

const DEBOUNCE_MS = 400;

export default function FoodSearch( { onResolve }: FoodSearchProps ) {
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
				path: `/nutrio/v1/foods/search?query=${ encodeURIComponent( value ) }`,
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
		debounceRef.current = setTimeout( () => runSearch( value ), DEBOUNCE_MS );
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

			{ isSearching && <p style={ { fontSize: '12.5px', color: 'var(--ink-muted)' } }>{ __( 'Searching…', 'nutrio' ) }</p> }

			{ ! isSearching && query && results.length === 0 && (
				<p style={ { fontSize: '12.5px', color: 'var(--ink-muted)' } }>{ __( 'No matches.', 'nutrio' ) }</p>
			) }

			{ results.map( ( food ) => (
				<button
					key={ food.fdcId }
					className={ styles.result }
					onClick={ () => handleSelect( food.fdcId ) }
					disabled={ resolvingId !== null }
				>
					<div>
						<div className={ styles.name }>{ food.description }</div>
						<div className={ styles.meta }>{ food.dataType }</div>
					</div>
					<Chip tone={ food.dataType === 'Branded' ? 'clay' : 'sage' }>
						{ resolvingId === food.fdcId ? __( 'Adding…', 'nutrio' ) : food.dataType === 'Branded' ? __( 'Branded', 'nutrio' ) : __( 'USDA', 'nutrio' ) }
					</Chip>
				</button>
			) ) }

			<p className="nutrio-field-hint" style={ { marginTop: '8px' } }>
				{ __( 'Foundation & SR Legacy report per 100g and are preferred for clinical accuracy over manufacturer-supplied Branded values.', 'nutrio' ) }
			</p>
		</>
	);
}
