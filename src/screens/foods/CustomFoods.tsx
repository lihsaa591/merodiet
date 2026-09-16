import { useState } from '@wordpress/element';
import { useSelect, useDispatch } from '@wordpress/data';
import { __ } from '@wordpress/i18n';
import { STORE_NAME } from '../../store/customFoods';
import { alertDialog, confirmDialog } from '../../utils/confirmDialog';
import Panel, { PanelBody } from '../../components/ui/Panel';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import Drawer from '../../components/ui/Drawer';
import Pagination from '../../components/ui/Pagination';
import CustomFoodForm from './CustomFoodForm';
import { formatAmount } from '../../utils/nutrients';
import type { CustomFood, CustomFoodInput } from '../../types';

interface CustomFoodsStoreSelectors {
	getCustomFoodsPage: ( page: number ) => CustomFood[];
	getCustomFoodsTotalPages: () => number;
	hasFinishedResolution: ( selector: string, args?: unknown[] ) => boolean;
}

export default function CustomFoods() {
	const [ isDrawerOpen, setDrawerOpen ] = useState( false );
	const [ editingId, setEditingId ] = useState< number | null >( null );
	const [ isFormDirty, setFormDirty ] = useState( false );
	const [ page, setPage ] = useState( 1 );

	const { foods, totalPages, isLoading } = useSelect(
		( select ) => {
			const store = select(
				STORE_NAME
			) as unknown as CustomFoodsStoreSelectors;

			return {
				foods: store.getCustomFoodsPage( page ),
				totalPages: store.getCustomFoodsTotalPages(),
				isLoading: ! store.hasFinishedResolution(
					'getCustomFoodsPage',
					[ page ]
				),
			};
		},
		[ page ]
	);

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
		} else {
			await createCustomFood( data );
		}
		closeDrawer();
	};

	const handleDelete = async ( food: CustomFood ) => {
		const confirmed = await confirmDialog( {
			message: __(
				'Remove this custom food? This cannot be undone.',
				'nutrio'
			),
			confirmLabel: __( 'Remove', 'nutrio' ),
			destructive: true,
		} );

		if ( ! confirmed ) {
			return;
		}

		try {
			await deleteCustomFood( food.id );
		} catch ( error ) {
			// apiFetch rejects with the REST API's error envelope
			// ({code, message, data}), not a native Error — most likely
			// here: 409, this food is still used in a recipe.
			const message =
				error &&
				typeof error === 'object' &&
				'message' in error &&
				typeof error.message === 'string'
					? error.message
					: __(
							'Something went wrong removing this food.',
							'nutrio'
					  );

			await alertDialog( { message } );
		}
	};

	return (
		<>
			<div className="nutrio-topbar">
				<div>
					<h1>{ __( 'Custom foods', 'nutrio' ) }</h1>
					<div className="nutrio-topbar-sub">
						{ __(
							"For ingredients not in USDA's database — a client's branded product, a homemade blend.",
							'nutrio'
						) }
					</div>
				</div>
				<Button variant="primary" onClick={ openAdd }>
					<PlusIcon />
					{ __( 'Add custom food', 'nutrio' ) }
				</Button>
			</div>

			<Panel>
				<PanelBody className="nutrio-table-wrap">
					{ isLoading && <p>{ __( 'Loading…', 'nutrio' ) }</p> }

					{ ! isLoading && foods.length === 0 && (
						<p>
							{ __(
								"No custom foods yet. Add one for anything not in USDA's database.",
								'nutrio'
							) }
						</p>
					) }

					{ ! isLoading && foods.length > 0 && (
						<table className="nutrio-table">
							<thead>
								<tr>
									<th>{ __( 'Name', 'nutrio' ) }</th>
									<th>{ __( 'Calories', 'nutrio' ) }</th>
									<th>{ __( 'Protein', 'nutrio' ) }</th>
									<th>{ __( 'Carbs', 'nutrio' ) }</th>
									<th>{ __( 'Fat', 'nutrio' ) }</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{ foods.map( ( food ) => (
									<tr key={ food.id }>
										<td style={ { fontWeight: 600 } }>
											{ food.name }
										</td>
										<td className="nutrio-mono">
											{ formatAmount(
												food.calories ?? null,
												''
											) }
										</td>
										<td className="nutrio-mono">
											{ formatAmount(
												food.protein ?? null,
												'g'
											) }
										</td>
										<td className="nutrio-mono">
											{ formatAmount(
												food.carbs ?? null,
												'g'
											) }
										</td>
										<td className="nutrio-mono">
											{ formatAmount(
												food.fat ?? null,
												'g'
											) }
										</td>
										<td>
											<div className="nutrio-row-actions">
												<IconButton
													label={ __(
														'Edit custom food',
														'nutrio'
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
														'nutrio'
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
					) }
				</PanelBody>
			</Panel>

			<Pagination
				page={ page }
				totalPages={ totalPages }
				onPageChange={ setPage }
			/>

			<Drawer
				isOpen={ isDrawerOpen }
				title={
					editingFood
						? __( 'Edit custom food', 'nutrio' )
						: __( 'Add custom food', 'nutrio' )
				}
				onClose={ closeDrawer }
				confirmClose={ async () =>
					! isFormDirty ||
					confirmDialog( {
						message: __( 'Discard unsaved changes?', 'nutrio' ),
						confirmLabel: __( 'Discard', 'nutrio' ),
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
