import { useState } from '@wordpress/element';
import { useSelect, useDispatch } from '@wordpress/data';
import { __, _n, sprintf } from '@wordpress/i18n';
import { STORE_NAME } from '../../store/customFoods';
import { confirmDialog } from '../../utils/confirmDialog';
import { errorMessage, reportBulkResult, toast } from '../../utils/toast';
import { useBulkSelection } from '../../hooks/useBulkSelection';
import { usePagination } from '../../hooks/usePagination';
import { useShowFilters } from '../../hooks/useShowFilters';
import Panel, { PanelBody } from '../../components/ui/Panel';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import Drawer from '../../components/ui/Drawer';
import Pagination from '../../components/ui/Pagination';
import ListFilters from '../../components/ui/ListFilters';
import BulkActionBar from '../../components/ui/BulkActionBar';
import CustomFoodForm from './CustomFoodForm';
import { formatAmount } from '../../utils/nutrients';
import { formatDateTime } from '../../utils/date';
import type { CustomFood, CustomFoodInput } from '../../types';

interface CustomFoodsStoreSelectors {
	getCustomFoodsPage: (
		page: number,
		perPage: number,
		filters: Record< string, string >
	) => CustomFood[];
	getCustomFoodsTotal: () => number;
	getCustomFoodsTotalPages: () => number;
	hasFinishedResolution: ( selector: string, args?: unknown[] ) => boolean;
}

const CUSTOM_FOOD_FILTER_DEFAULTS = { search: '' };

export default function CustomFoods() {
	const [ isDrawerOpen, setDrawerOpen ] = useState( false );
	const [ editingId, setEditingId ] = useState< number | null >( null );
	const [ isFormDirty, setFormDirty ] = useState( false );
	const { page, perPage, filters, setPage, setPerPage, setFilter } =
		usePagination( 'foods', {
			filterDefaults: CUSTOM_FOOD_FILTER_DEFAULTS,
		} );

	const { foods, total, totalPages, isLoading } = useSelect(
		( select ) => {
			const store = select(
				STORE_NAME
			) as unknown as CustomFoodsStoreSelectors;

			return {
				foods: store.getCustomFoodsPage( page, perPage, filters ),
				total: store.getCustomFoodsTotal(),
				totalPages: store.getCustomFoodsTotalPages(),
				isLoading: ! store.hasFinishedResolution(
					'getCustomFoodsPage',
					[ page, perPage, filters ]
				),
			};
		},
		[ page, perPage, filters ]
	);

	const isFiltering = Boolean( filters.search );
	const showFilters = useShowFilters( total, isFiltering );

	const { createCustomFood, updateCustomFood, deleteCustomFood } =
		useDispatch( STORE_NAME ) as {
			createCustomFood: (
				data: CustomFoodInput
			) => Promise< CustomFood >;
			updateCustomFood: (
				id: number,
				data: Partial< CustomFoodInput >
			) => Promise< CustomFood >;
			deleteCustomFood: ( id: number ) => Promise< void >;
		};

	const editingFood = foods.find( ( food ) => food.id === editingId ) ?? null;
	const bulk = useBulkSelection( foods );

	const openAdd = () => {
		setEditingId( null );
		setDrawerOpen( true );
	};

	const openEdit = ( id: number ) => {
		setEditingId( id );
		setDrawerOpen( true );
	};

	const closeDrawer = () => setDrawerOpen( false );

	const handleSubmit = async ( data: CustomFoodInput ) => {
		if ( editingFood ) {
			await updateCustomFood( editingFood.id, data );
			toast.success( __( 'Custom food updated.', 'merodiet' ) );
		} else {
			await createCustomFood( data );
			toast.success( __( 'Custom food added.', 'merodiet' ) );
		}
		closeDrawer();
	};

	const handleDelete = async ( food: CustomFood ) => {
		const confirmed = await confirmDialog( {
			message: __(
				'Remove this custom food? This cannot be undone.',
				'merodiet'
			),
			confirmLabel: __( 'Remove', 'merodiet' ),
			destructive: true,
		} );

		if ( ! confirmed ) {
			return;
		}

		try {
			await deleteCustomFood( food.id );
			toast.success( __( 'Custom food removed.', 'merodiet' ) );
		} catch ( error ) {
			// Most likely here: 409, this food is still used in a recipe.
			toast.error(
				errorMessage(
					error,
					__( 'Something went wrong removing this food.', 'merodiet' )
				)
			);
		}
	};

	const handleBulkDelete = async () => {
		const confirmed = await confirmDialog( {
			message: sprintf(
				/* translators: %d: number of custom foods being removed */
				__(
					'Remove %d selected custom food(s)? This cannot be undone.',
					'merodiet'
				),
				bulk.count
			),
			confirmLabel: __( 'Remove', 'merodiet' ),
			destructive: true,
		} );

		if ( ! confirmed ) {
			return;
		}

		const results = await Promise.allSettled(
			bulk.selectedItems.map( ( food ) => deleteCustomFood( food.id ) )
		);
		bulk.clear();

		// A food still used in a recipe is blocked (409) rather than
		// silently deleted — surface that rather than pretending every
		// selected row was removed.
		reportBulkResult( results, {
			success: ( count ) =>
				sprintf(
					/* translators: %d: number of custom foods removed */
					_n(
						'%d custom food removed.',
						'%d custom foods removed.',
						count,
						'merodiet'
					),
					count
				),
			failure: ( count ) =>
				sprintf(
					/* translators: %d: number of custom foods that could not be removed */
					__(
						"%d couldn't be removed because they're still used in a recipe.",
						'merodiet'
					),
					count
				),
		} );
	};

	// Bulk import (e.g. a CSV of a client's regular branded products) isn't
	// built yet — see JOURNEY.md. This is a placeholder entry point so the
	// affordance exists in the UI ahead of the feature.
	const handleImportClick = () => {
		toast.info(
			__(
				"Import is coming soon — you'll be able to bulk-import custom foods (e.g. from a CSV).",
				'merodiet'
			)
		);
	};

	return (
		<>
			<div className="merodiet-topbar">
				<h1>{ __( 'Custom foods', 'merodiet' ) }</h1>
				<div
					style={ {
						display: 'flex',
						alignItems: 'center',
						gap: '10px',
					} }
				>
					<div style={ { position: 'relative' } }>
						<Button
							variant="ghost"
							onClick={ handleImportClick }
							style={ { opacity: 0.65 } }
						>
							<ImportIcon />
							{ __( 'Import food data', 'merodiet' ) }
						</Button>
						<span
							style={ {
								position: 'absolute',
								top: '-8px',
								right: '-8px',
								background: 'var(--sage)',
								color: '#fff',
								fontSize: '9px',
								fontWeight: 700,
								lineHeight: 1,
								letterSpacing: '0.02em',
								padding: '3px 6px',
								borderRadius: '999px',
								pointerEvents: 'none',
							} }
						>
							{ __( 'Soon', 'merodiet' ) }
						</span>
					</div>
					<Button variant="primary" onClick={ openAdd }>
						<PlusIcon />
						{ __( 'Add custom food', 'merodiet' ) }
					</Button>
				</div>
			</div>

			{ showFilters && (
				<ListFilters
					search={ filters.search }
					onSearchChange={ ( value ) => setFilter( 'search', value ) }
					searchPlaceholder={ __(
						'Search custom foods…',
						'merodiet'
					) }
				/>
			) }

			<Panel>
				<PanelBody className="merodiet-table-wrap">
					{ isLoading && <p>{ __( 'Loading…', 'merodiet' ) }</p> }

					{ ! isLoading && foods.length === 0 && (
						<p>
							{ isFiltering
								? __(
										'No custom foods match your search.',
										'merodiet'
								  )
								: __( 'No custom foods yet.', 'merodiet' ) }
						</p>
					) }

					{ ! isLoading && foods.length > 0 && (
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
										/* translators: %d: number of custom foods selected */
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
													'Select all custom foods',
													'merodiet'
												) }
											/>
										</th>
										<th>{ __( 'Name', 'merodiet' ) }</th>
										<th>
											{ __( 'Calories', 'merodiet' ) }
										</th>
										<th>{ __( 'Protein', 'merodiet' ) }</th>
										<th>{ __( 'Carbs', 'merodiet' ) }</th>
										<th>{ __( 'Fat', 'merodiet' ) }</th>
										<th>{ __( 'Updated', 'merodiet' ) }</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									{ foods.map( ( food ) => (
										<tr key={ food.id }>
											<td>
												<input
													type="checkbox"
													checked={ bulk.isSelected(
														food.id
													) }
													onChange={ () =>
														bulk.toggle( food.id )
													}
													aria-label={ sprintf(
														/* translators: %s: custom food name */
														__(
															'Select %s',
															'merodiet'
														),
														food.name
													) }
												/>
											</td>
											<td style={ { fontWeight: 600 } }>
												{ food.name }
											</td>
											<td className="merodiet-mono">
												{ formatAmount(
													food.calories ?? null,
													''
												) }
											</td>
											<td className="merodiet-mono">
												{ formatAmount(
													food.protein ?? null,
													'g'
												) }
											</td>
											<td className="merodiet-mono">
												{ formatAmount(
													food.carbs ?? null,
													'g'
												) }
											</td>
											<td className="merodiet-mono">
												{ formatAmount(
													food.fat ?? null,
													'g'
												) }
											</td>
											<td>
												{ formatDateTime(
													food.updated_at
												) }
											</td>
											<td>
												<div className="merodiet-row-actions">
													<IconButton
														label={ __(
															'Edit custom food',
															'merodiet'
														) }
														onClick={ () =>
															openEdit( food.id )
														}
													>
														<EditIcon />
													</IconButton>
													<IconButton
														label={ __(
															'Remove custom food',
															'merodiet'
														) }
														onClick={ () =>
															handleDelete( food )
														}
													>
														<TrashIcon />
													</IconButton>
												</div>
											</td>
										</tr>
									) ) }
								</tbody>
							</table>
						</>
					) }
				</PanelBody>
			</Panel>

			<Pagination
				page={ page }
				totalPages={ totalPages }
				onPageChange={ setPage }
				total={ total }
				perPage={ perPage }
				onPerPageChange={ setPerPage }
			/>

			<Drawer
				isOpen={ isDrawerOpen }
				title={
					editingFood
						? __( 'Edit custom food', 'merodiet' )
						: __( 'Add custom food', 'merodiet' )
				}
				onClose={ closeDrawer }
				confirmClose={ async () =>
					! isFormDirty ||
					confirmDialog( {
						message: __( 'Discard unsaved changes?', 'merodiet' ),
						confirmLabel: __( 'Discard', 'merodiet' ),
						destructive: true,
					} )
				}
			>
				<CustomFoodForm
					key={ editingFood?.id ?? 'new' }
					food={ editingFood }
					onSubmit={ handleSubmit }
					onCancel={ closeDrawer }
					onDirtyChange={ setFormDirty }
				/>
			</Drawer>
		</>
	);
}

function ImportIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		>
			<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
		</svg>
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
