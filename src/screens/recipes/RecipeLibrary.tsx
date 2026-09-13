import { __, sprintf } from '@wordpress/i18n';
import Panel, { PanelBody } from '../../components/ui/Panel';
import Button from '../../components/ui/Button';
import BulkActionBar from '../../components/ui/BulkActionBar';
import IconButton from '../../components/ui/IconButton';
import { useBulkSelection } from '../../hooks/useBulkSelection';
import { formatAmount, summarizeNutrients } from '../../utils/nutrients';
import type { Recipe } from '../../types';

interface RecipeLibraryProps {
	recipes: Recipe[];
	isLoading: boolean;
	onAdd: () => void;
	onEdit: ( id: number ) => void;
	onDelete: ( recipe: Recipe ) => void;
	onBulkDelete: ( recipes: Recipe[] ) => Promise< void >;
}

export default function RecipeLibrary( {
	recipes,
	isLoading,
	onAdd,
	onEdit,
	onDelete,
	onBulkDelete,
}: RecipeLibraryProps ) {
	const bulk = useBulkSelection( recipes );

	const handleBulkDelete = async () => {
		await onBulkDelete( bulk.selectedItems );
		bulk.clear();
	};

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
						<p>
							{ __(
								'No recipes yet. Add your first recipe to start building your library.',
								'nutrio'
							) }
						</p>
					) }

					{ ! isLoading && recipes.length > 0 && (
						<>
							<BulkActionBar
								count={ bulk.count }
								onClear={ bulk.clear }
							>
								<Button
									variant="primary"
									destructive
									onClick={ handleBulkDelete }
								>
									{ sprintf(
										/* translators: %d: number of recipes selected */
										__( 'Delete selected (%d)', 'nutrio' ),
										bulk.count
									) }
								</Button>
							</BulkActionBar>

							<table className="nutrio-table">
								<thead>
									<tr>
										<th>
											<input
												type="checkbox"
												checked={ bulk.isAllSelected }
												ref={ ( el ) => {
													if ( el ) {
														el.indeterminate =
															bulk.isSomeSelected;
													}
												} }
												onChange={ bulk.toggleAll }
												aria-label={ __(
													'Select all recipes',
													'nutrio'
												) }
											/>
										</th>
										<th>{ __( 'Name', 'nutrio' ) }</th>
										<th>{ __( 'Servings', 'nutrio' ) }</th>
										<th>
											{ __( 'Kcal / serving', 'nutrio' ) }
										</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									{ recipes.map( ( recipe ) => {
										const summary = summarizeNutrients(
											recipe.nutrient_totals_per_serving
										);

										return (
											<tr key={ recipe.id }>
												<td>
													<input
														type="checkbox"
														checked={ bulk.isSelected(
															recipe.id
														) }
														onChange={ () =>
															bulk.toggle(
																recipe.id
															)
														}
														aria-label={ sprintf(
															/* translators: %s: recipe name */
															__(
																'Select %s',
																'nutrio'
															),
															recipe.name
														) }
													/>
												</td>
												<td
													style={ {
														fontWeight: 600,
													} }
												>
													{ recipe.name }
												</td>
												<td>{ recipe.servings }</td>
												<td className="nutrio-mono">
													{ formatAmount(
														summary.kcal,
														''
													) }
												</td>
												<td>
													<div className="nutrio-row-actions">
														<IconButton
															label={ __(
																'Edit recipe',
																'nutrio'
															) }
															onClick={ () =>
																onEdit(
																	recipe.id
																)
															}
														>
															<EditIcon />
														</IconButton>
														<IconButton
															label={ __(
																'Remove recipe',
																'nutrio'
															) }
															onClick={ () =>
																onDelete(
																	recipe
																)
															}
														>
															<TrashIcon />
														</IconButton>
													</div>
												</td>
											</tr>
										);
									} ) }
								</tbody>
							</table>
						</>
					) }
				</PanelBody>
			</Panel>
		</>
	);
}

function PlusIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		>
			<path d="M12 5v14M5 12h14" />
		</svg>
	);
}

function EditIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		>
			<path d="M12 20h9" />
			<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
		</svg>
	);
}

function TrashIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		>
			<path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" />
		</svg>
	);
}
