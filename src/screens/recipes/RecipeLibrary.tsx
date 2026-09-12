import { __ } from '@wordpress/i18n';
import Panel, { PanelBody } from '../../components/ui/Panel';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import { formatAmount, summarizeNutrients } from '../../utils/nutrients';
import type { Recipe } from '../../types';

interface RecipeLibraryProps {
	recipes: Recipe[];
	isLoading: boolean;
	onAdd: () => void;
	onEdit: ( id: number ) => void;
	onDelete: ( recipe: Recipe ) => void;
}

export default function RecipeLibrary( { recipes, isLoading, onAdd, onEdit, onDelete }: RecipeLibraryProps ) {
	return (
		<>
			<div className="nutrio-topbar">
				<h1>{ __( 'Recipe builder', 'nutrio' ) }</h1>
				<Button variant="primary" onClick={ onAdd }>
					<PlusIcon />
					{ __( 'New recipe', 'nutrio' ) }
				</Button>
			</div>

			<Panel>
				<PanelBody className="nutrio-table-wrap">
					{ isLoading && <p>{ __( 'Loading…', 'nutrio' ) }</p> }

					{ ! isLoading && recipes.length === 0 && (
						<p>{ __( 'No recipes yet. Add your first recipe to start building your library.', 'nutrio' ) }</p>
					) }

					{ ! isLoading && recipes.length > 0 && (
						<table className="nutrio-table">
							<thead>
								<tr>
									<th>{ __( 'Name', 'nutrio' ) }</th>
									<th>{ __( 'Servings', 'nutrio' ) }</th>
									<th>{ __( 'Kcal / serving', 'nutrio' ) }</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{ recipes.map( ( recipe ) => {
									const summary = summarizeNutrients( recipe.nutrient_totals_per_serving );

									return (
										<tr key={ recipe.id }>
											<td style={ { fontWeight: 600 } }>{ recipe.name }</td>
											<td>{ recipe.servings }</td>
											<td className="nutrio-mono">{ formatAmount( summary.kcal, '' ) }</td>
											<td>
												<div className="nutrio-row-actions">
													<IconButton label={ __( 'Edit recipe', 'nutrio' ) } onClick={ () => onEdit( recipe.id ) }>
														<EditIcon />
													</IconButton>
													<IconButton label={ __( 'Remove recipe', 'nutrio' ) } onClick={ () => onDelete( recipe ) }>
														<TrashIcon />
													</IconButton>
												</div>
											</td>
										</tr>
									);
								} ) }
							</tbody>
						</table>
					) }
				</PanelBody>
			</Panel>
		</>
	);
}

function PlusIcon() {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<path d="M12 5v14M5 12h14" />
		</svg>
	);
}

function EditIcon() {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<path d="M12 20h9" />
			<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
		</svg>
	);
}

function TrashIcon() {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" />
		</svg>
	);
}
