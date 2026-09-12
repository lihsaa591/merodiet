import { useState } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import { __ } from '@wordpress/i18n';
import { STORE_NAME as RECIPES_STORE } from '../../store/recipes';
import FoodSearch from '../recipes/FoodSearch';
import styles from './ItemSearch.module.css';
import type { Recipe, ResolvedFood } from '../../types';

interface RecipesStoreSelectors {
	getRecipes: () => Recipe[];
}

interface ItemSearchProps {
	onSelectFood: ( food: ResolvedFood ) => void;
	onSelectRecipe: ( recipe: Recipe ) => void;
}

export default function ItemSearch( {
	onSelectFood,
	onSelectRecipe,
}: ItemSearchProps ) {
	const [ tab, setTab ] = useState< 'recipes' | 'foods' >( 'recipes' );
	const [ query, setQuery ] = useState( '' );

	const recipes = useSelect( ( select ) => {
		const store = select(
			RECIPES_STORE
		) as unknown as RecipesStoreSelectors;
		return store.getRecipes();
	}, [] );

	const filteredRecipes = recipes.filter( ( recipe ) =>
		recipe.name.toLowerCase().includes( query.toLowerCase() )
	);

	return (
		<div>
			<div className={ styles.tabs }>
				<button
					className={ `${ styles.tab } ${
						tab === 'recipes' ? styles.isActive : ''
					}`.trim() }
					onClick={ () => setTab( 'recipes' ) }
				>
					{ __( 'My Recipes', 'nutrio' ) }
				</button>
				<button
					className={ `${ styles.tab } ${
						tab === 'foods' ? styles.isActive : ''
					}`.trim() }
					onClick={ () => setTab( 'foods' ) }
				>
					{ __( 'USDA Foods', 'nutrio' ) }
				</button>
			</div>

			{ tab === 'recipes' && (
				<>
					<div
						className="nutrio-field"
						style={ { marginBottom: '12px' } }
					>
						<input
							type="text"
							value={ query }
							onChange={ ( e ) => setQuery( e.target.value ) }
							placeholder={ __(
								'Search your recipes…',
								'nutrio'
							) }
						/>
					</div>

					{ filteredRecipes.length === 0 && (
						<p
							style={ {
								fontSize: '12.5px',
								color: 'var(--ink-muted)',
							} }
						>
							{ recipes.length === 0
								? __(
										'No recipes in your library yet.',
										'nutrio'
								  )
								: __( 'No matches.', 'nutrio' ) }
						</p>
					) }

					{ filteredRecipes.map( ( recipe ) => (
						<button
							key={ recipe.id }
							className={ styles.result }
							onClick={ () => onSelectRecipe( recipe ) }
						>
							<div className={ styles.name }>{ recipe.name }</div>
							<div className={ styles.meta }>
								{ __( 'Servings:', 'nutrio' ) }{ ' ' }
								{ recipe.servings }
							</div>
						</button>
					) ) }
				</>
			) }

			{ tab === 'foods' && <FoodSearch onResolve={ onSelectFood } /> }
		</div>
	);
}
