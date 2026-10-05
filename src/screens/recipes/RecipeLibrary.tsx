import { __, sprintf } from '@wordpress/i18n';
import Panel, { PanelBody } from '../../components/ui/Panel';
import Button from '../../components/ui/Button';
import BulkActionBar from '../../components/ui/BulkActionBar';
import IconButton from '../../components/ui/IconButton';
import Pagination from '../../components/ui/Pagination';
import ListFilters from '../../components/ui/ListFilters';
import { useBulkSelection } from '../../hooks/useBulkSelection';
import { formatAmount, summarizeNutrients } from '../../utils/nutrients';
import { formatDateTime } from '../../utils/date';
import type { Recipe } from '../../types';

interface RecipeLibraryProps {
	recipes: Recipe[];
	isLoading: boolean;
	page: number;
	totalPages: number;
	onPageChange: ( page: number ) => void;
	total: number;
	perPage: number;
	onPerPageChange: ( perPage: number ) => void;
	search: string;
	onSearchChange: ( value: string ) => void;
	showFilters: boolean;
	isFiltering: boolean;
	onAdd: () => void;
	onEdit: ( id: number ) => void;
	onDelete: ( recipe: Recipe ) => void;
	onBulkDelete: ( recipes: Recipe[] ) => Promise< void >;
}

export default function RecipeLibrary( {
	recipes,
	isLoading,
	page,
	totalPages,
	onPageChange,
	total,
	perPage,
	onPerPageChange,
	search,
	onSearchChange,
	showFilters,
	isFiltering,
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
			<div className="merodiet-topbar">
				<h1>{ __( 'Recipe builder', 'merodiet' ) }</h1>
				<Button variant="primary" onClick={ onAdd }>
					<PlusIcon />
					{ __( 'New recipe', 'merodiet' ) }
				</Button>
			</div>

			{ showFilters && (
				<ListFilters
					search={ search }
					onSearchChange={ onSearchChange }
					searchPlaceholder={ __( 'Search recipes…', 'merodiet' ) }
				/>
			) }

			<Panel>
				<PanelBody className="merodiet-table-wrap">
					{ isLoading && <p>{ __( 'Loading…', 'merodiet' ) }</p> }

					{ ! isLoading && recipes.length === 0 && (
						<p>
							{ isFiltering
								? __(
										'No recipes match your search.',
										'merodiet'
								  )
								: __(
										'No recipes yet. Add your first recipe to start building your library.',
										'merodiet'
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
										__(
											'Delete selected (%d)',
											'merodiet'
										),
										bulk.count
									) }
								</Button>
							</BulkActionBar>

							<table className="merodiet-table">
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
													'merodiet'
												) }
											/>
										</th>
										<th>{ __( 'Name', 'merodiet' ) }</th>
										<th>
											{ __( 'Servings', 'merodiet' ) }
										</th>
										<th>
											{ __(
												'Kcal / serving',
												'merodiet'
											) }
										</th>
										<th>{ __( 'Updated', 'merodiet' ) }</th>
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
																'merodiet'
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
												<td className="merodiet-mono">
													{ formatAmount(
														summary.kcal,
														''
													) }
												</td>
												<td>
													{ formatDateTime(
														recipe.updated_at
													) }
												</td>
												<td>
													<div className="merodiet-row-actions">
														<IconButton
															label={ __(
																'Edit recipe',
																'merodiet'
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
																'merodiet'
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

			<Pagination
				page={ page }
				totalPages={ totalPages }
				onPageChange={ onPageChange }
				total={ total }
				perPage={ perPage }
				onPerPageChange={ onPerPageChange }
			/>
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
