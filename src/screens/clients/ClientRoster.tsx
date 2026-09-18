import { useState } from '@wordpress/element';
import { useSelect, useDispatch } from '@wordpress/data';
import { __, sprintf } from '@wordpress/i18n';
import { STORE_NAME } from '../../store/clients';
import { confirmDialog } from '../../utils/confirmDialog';
import { useBulkSelection } from '../../hooks/useBulkSelection';
import { usePagination } from '../../hooks/usePagination';
import { useShowFilters } from '../../hooks/useShowFilters';
import Panel, { PanelBody } from '../../components/ui/Panel';
import Button from '../../components/ui/Button';
import BulkActionBar from '../../components/ui/BulkActionBar';
import Chip from '../../components/ui/Chip';
import Avatar from '../../components/ui/Avatar';
import IconButton from '../../components/ui/IconButton';
import Drawer from '../../components/ui/Drawer';
import Pagination from '../../components/ui/Pagination';
import ListFilters from '../../components/ui/ListFilters';
import ClientForm from './ClientForm';
import { formatDateTime } from '../../utils/date';
import type { Client, ClientInput } from '../../types';

interface ClientsStoreSelectors {
	getClientsPage: (
		page: number,
		perPage: number,
		filters: Record< string, string >
	) => Client[];
	getClientsTotal: () => number;
	getClientsTotalPages: () => number;
	hasFinishedResolution: ( selector: string, args?: unknown[] ) => boolean;
}

const CLIENT_FILTER_DEFAULTS = { search: '', status: '' };
const CLIENT_STATUS_OPTIONS = [
	{ value: '', label: __( 'All statuses', 'nutrio' ) },
	{ value: 'active', label: __( 'Active', 'nutrio' ) },
	{ value: 'paused', label: __( 'Paused', 'nutrio' ) },
];

export default function ClientRoster() {
	const [ isDrawerOpen, setDrawerOpen ] = useState( false );
	const [ editingId, setEditingId ] = useState< number | null >( null );
	const [ isFormDirty, setFormDirty ] = useState( false );
	const { page, perPage, filters, setPage, setPerPage, setFilter } =
		usePagination( 'clients', { filterDefaults: CLIENT_FILTER_DEFAULTS } );

	const { clients, total, totalPages, isLoading } = useSelect(
		( select ) => {
			const store = select(
				STORE_NAME
			) as unknown as ClientsStoreSelectors;

			return {
				clients: store.getClientsPage( page, perPage, filters ),
				total: store.getClientsTotal(),
				totalPages: store.getClientsTotalPages(),
				isLoading: ! store.hasFinishedResolution( 'getClientsPage', [
					page,
					perPage,
					filters,
				] ),
			};
		},
		[ page, perPage, filters ]
	);

	const isFiltering = Boolean( filters.search || filters.status );
	const showFilters = useShowFilters( total, isFiltering );

	const { createClient, updateClient, deleteClient } = useDispatch(
		STORE_NAME
	) as {
		createClient: ( data: ClientInput ) => Promise< Client >;
		updateClient: (
			id: number,
			data: Partial< ClientInput >
		) => Promise< Client >;
		deleteClient: ( id: number ) => Promise< void >;
	};

	const editingClient =
		clients.find( ( client ) => client.id === editingId ) ?? null;

	const bulk = useBulkSelection( clients );

	const openAdd = () => {
		setEditingId( null );
		setDrawerOpen( true );
	};

	const openEdit = ( id: number ) => {
		setEditingId( id );
		setDrawerOpen( true );
	};

	const closeDrawer = () => setDrawerOpen( false );

	const handleSubmit = async ( data: ClientInput ) => {
		if ( editingClient ) {
			await updateClient( editingClient.id, data );
		} else {
			await createClient( data );
		}
		closeDrawer();
	};

	const handleDelete = async ( client: Client ) => {
		const confirmed = await confirmDialog( {
			message: __(
				'Remove this client? This cannot be undone.',
				'nutrio'
			),
			confirmLabel: __( 'Remove', 'nutrio' ),
			destructive: true,
		} );
		if ( confirmed ) {
			deleteClient( client.id );
		}
	};

	const handleBulkDelete = async () => {
		const confirmed = await confirmDialog( {
			message: sprintf(
				/* translators: %d: number of clients being removed */
				__(
					'Remove %d selected client(s)? This cannot be undone.',
					'nutrio'
				),
				bulk.count
			),
			confirmLabel: __( 'Remove', 'nutrio' ),
			destructive: true,
		} );
		if ( confirmed ) {
			await Promise.allSettled(
				bulk.selectedItems.map( ( c ) => deleteClient( c.id ) )
			);
			bulk.clear();
		}
	};

	const handleBulkMarkStatus = async ( status: 'active' | 'paused' ) => {
		await Promise.allSettled(
			bulk.selectedItems.map( ( c ) => updateClient( c.id, { status } ) )
		);
		bulk.clear();
	};

	return (
		<>
			<div className="nutrio-topbar">
				<div>
					<h1>{ __( 'Clients', 'nutrio' ) }</h1>
				</div>
				<Button variant="primary" onClick={ openAdd }>
					<PlusIcon />
					{ __( 'Add client', 'nutrio' ) }
				</Button>
			</div>

			{ showFilters && (
				<ListFilters
					search={ filters.search }
					onSearchChange={ ( value ) => setFilter( 'search', value ) }
					searchPlaceholder={ __(
						'Search name or email…',
						'nutrio'
					) }
					status={ filters.status }
					onStatusChange={ ( value ) => setFilter( 'status', value ) }
					statusOptions={ CLIENT_STATUS_OPTIONS }
				/>
			) }

			<Panel>
				<PanelBody className="nutrio-table-wrap">
					{ isLoading && <p>{ __( 'Loading…', 'nutrio' ) }</p> }

					{ ! isLoading && clients.length === 0 && (
						<p>
							{ isFiltering
								? __(
										'No clients match your search.',
										'nutrio'
								  )
								: __(
										'No clients yet. Add your first client to get started.',
										'nutrio'
								  ) }
						</p>
					) }

					{ ! isLoading && clients.length > 0 && (
						<>
							<BulkActionBar
								count={ bulk.count }
								onClear={ bulk.clear }
							>
								<Button
									variant="ghost"
									onClick={ () =>
										handleBulkMarkStatus( 'active' )
									}
								>
									{ __( 'Mark active', 'nutrio' ) }
								</Button>
								<Button
									variant="ghost"
									onClick={ () =>
										handleBulkMarkStatus( 'paused' )
									}
								>
									{ __( 'Mark paused', 'nutrio' ) }
								</Button>
								<Button
									variant="primary"
									destructive
									onClick={ handleBulkDelete }
								>
									{ __( 'Delete selected', 'nutrio' ) }
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
													'Select all clients',
													'nutrio'
												) }
											/>
										</th>
										<th>{ __( 'Name', 'nutrio' ) }</th>
										<th>{ __( 'Email', 'nutrio' ) }</th>
										<th>{ __( 'Allergies', 'nutrio' ) }</th>
										<th>{ __( 'Status', 'nutrio' ) }</th>
										<th>{ __( 'Added', 'nutrio' ) }</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									{ clients.map( ( client ) => (
										<tr key={ client.id }>
											<td>
												<input
													type="checkbox"
													checked={ bulk.isSelected(
														client.id
													) }
													onChange={ () =>
														bulk.toggle( client.id )
													}
													aria-label={ sprintf(
														/* translators: %s: client's full name */
														__(
															'Select %s',
															'nutrio'
														),
														`${ client.first_name } ${ client.last_name }`
													) }
												/>
											</td>
											<td>
												<div className="nutrio-cell-name">
													<Avatar
														id={ client.id }
														firstName={
															client.first_name
														}
														lastName={
															client.last_name
														}
													/>
													{ client.first_name }{ ' ' }
													{ client.last_name }
												</div>
											</td>
											<td>{ client.email }</td>
											<td>
												{ ( client.allergies ?? [] )
													.length > 0 ? (
													client.allergies.map(
														( allergy ) => (
															<Chip
																key={ allergy }
																tone="clay"
															>
																{ allergy }
															</Chip>
														)
													)
												) : (
													<span
														style={ {
															color: 'var(--ink-faint)',
														} }
													>
														—
													</span>
												) }
											</td>
											<td>
												<Chip
													tone={
														client.status ===
														'active'
															? 'success'
															: 'clay'
													}
												>
													{ client.status }
												</Chip>
											</td>
											<td>
												{ formatDateTime(
													client.created_at
												) }
											</td>
											<td>
												<div className="nutrio-row-actions">
													<IconButton
														label={ __(
															'Edit client',
															'nutrio'
														) }
														onClick={ () =>
															openEdit(
																client.id
															)
														}
													>
														<EditIcon />
													</IconButton>
													<IconButton
														label={ __(
															'Remove client',
															'nutrio'
														) }
														onClick={ () =>
															handleDelete(
																client
															)
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
					editingClient
						? __( 'Edit client', 'nutrio' )
						: __( 'Add client', 'nutrio' )
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
				<ClientForm
					key={ editingClient?.id ?? 'new' }
					client={ editingClient }
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
