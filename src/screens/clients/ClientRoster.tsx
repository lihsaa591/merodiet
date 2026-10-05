import { useState } from '@wordpress/element';
import { useSelect, useDispatch } from '@wordpress/data';
import { __, _n, sprintf } from '@wordpress/i18n';
import { STORE_NAME } from '../../store/clients';
import { confirmDialog } from '../../utils/confirmDialog';
import { errorMessage, reportBulkResult, toast } from '../../utils/toast';
import { useBulkSelection } from '../../hooks/useBulkSelection';
import { usePagination } from '../../hooks/usePagination';
import { useShowFilters } from '../../hooks/useShowFilters';
import { useQueryParam } from '../../hooks/useQueryParam';
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
import ClientDetail from './ClientDetail';
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
	{ value: '', label: __( 'All statuses', 'merodiet' ) },
	{ value: 'active', label: __( 'Active', 'merodiet' ) },
	{ value: 'paused', label: __( 'Paused', 'merodiet' ) },
];

const PORTAL_STATUS = {
	not_invited: {
		label: __( 'Not invited', 'merodiet' ),
		tone: 'clay' as const,
	},
	invited: { label: __( 'Invited', 'merodiet' ), tone: 'sage' as const },
	active: { label: __( 'Joined', 'merodiet' ), tone: 'success' as const },
};

export default function ClientRoster() {
	const [ idParam, setIdParam ] = useQueryParam( 'id' );
	const [ isDrawerOpen, setDrawerOpen ] = useState( false );
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

	const { createClient, updateClient, deleteClient, inviteClient } =
		useDispatch( STORE_NAME ) as {
			createClient: ( data: ClientInput ) => Promise< Client >;
			updateClient: (
				id: number,
				data: Partial< ClientInput >
			) => Promise< Client >;
			deleteClient: ( id: number ) => Promise< void >;
			inviteClient: ( id: number ) => Promise< Client >;
		};

	const bulk = useBulkSelection( clients );

	const openAdd = () => {
		setDrawerOpen( true );
	};

	const openDetail = ( id: number ) => setIdParam( String( id ) );
	const backToRoster = () => setIdParam( null );

	const closeDrawer = () => setDrawerOpen( false );

	const handleSubmit = async ( data: ClientInput ) => {
		const created = ( await createClient( data ) ) as Client & {
			invite_error?: string | null;
		};
		closeDrawer();

		if ( data.send_invite && created.invite_error ) {
			toast.error(
				sprintf(
					/* translators: 1: client's name, 2: the reason the invite failed */
					__(
						'%1$s did save, but the portal invite could not be sent: %2$s. You can invite them manually from the roster.',
						'merodiet'
					),
					`${ created.first_name } ${ created.last_name }`,
					created.invite_error
				)
			);
		} else {
			toast.success( __( 'Client added.', 'merodiet' ) );
		}
	};

	const handleDelete = async ( client: Client ) => {
		const confirmed = await confirmDialog( {
			message: __(
				'Remove this client? This cannot be undone.',
				'merodiet'
			),
			confirmLabel: __( 'Remove', 'merodiet' ),
			destructive: true,
		} );
		if ( ! confirmed ) {
			return;
		}

		try {
			await deleteClient( client.id );
			toast.success( __( 'Client removed.', 'merodiet' ) );
		} catch ( error ) {
			toast.error(
				errorMessage(
					error,
					__( 'Could not remove this client.', 'merodiet' )
				)
			);
		}
	};

	const handleInvite = async ( client: Client ) => {
		try {
			await inviteClient( client.id );
			toast.success(
				sprintf(
					/* translators: %s: client's full name */
					__(
						'%s has been invited to the client portal.',
						'merodiet'
					),
					`${ client.first_name } ${ client.last_name }`
				)
			);
		} catch ( error ) {
			toast.error(
				errorMessage(
					error,
					__(
						'Could not send the invite. Please try again.',
						'merodiet'
					)
				)
			);
		}
	};

	const handleBulkDelete = async () => {
		const confirmed = await confirmDialog( {
			message: sprintf(
				/* translators: %d: number of clients being removed */
				__(
					'Remove %d selected client(s)? This cannot be undone.',
					'merodiet'
				),
				bulk.count
			),
			confirmLabel: __( 'Remove', 'merodiet' ),
			destructive: true,
		} );
		if ( confirmed ) {
			const results = await Promise.allSettled(
				bulk.selectedItems.map( ( c ) => deleteClient( c.id ) )
			);
			bulk.clear();
			reportBulkResult( results, {
				success: ( count ) =>
					sprintf(
						/* translators: %d: number of clients removed */
						_n(
							'%d client removed.',
							'%d clients removed.',
							count,
							'merodiet'
						),
						count
					),
				failure: __( 'Some clients could not be removed.', 'merodiet' ),
			} );
		}
	};

	const handleBulkMarkStatus = async ( status: 'active' | 'paused' ) => {
		const results = await Promise.allSettled(
			bulk.selectedItems.map( ( c ) => updateClient( c.id, { status } ) )
		);
		bulk.clear();
		reportBulkResult( results, {
			success: ( count ) =>
				sprintf(
					/* translators: %d: number of clients updated */
					_n(
						'%d client updated.',
						'%d clients updated.',
						count,
						'merodiet'
					),
					count
				),
			failure: __( 'Some clients could not be updated.', 'merodiet' ),
		} );
	};

	if ( idParam !== null ) {
		return (
			<ClientDetail
				clientId={ Number( idParam ) }
				onBack={ backToRoster }
			/>
		);
	}

	return (
		<>
			<div className="merodiet-topbar">
				<div>
					<h1>{ __( 'Clients', 'merodiet' ) }</h1>
				</div>
				<Button variant="primary" onClick={ openAdd }>
					<PlusIcon />
					{ __( 'Add client', 'merodiet' ) }
				</Button>
			</div>

			{ showFilters && (
				<ListFilters
					search={ filters.search }
					onSearchChange={ ( value ) => setFilter( 'search', value ) }
					searchPlaceholder={ __(
						'Search name or email…',
						'merodiet'
					) }
					status={ filters.status }
					onStatusChange={ ( value ) => setFilter( 'status', value ) }
					statusOptions={ CLIENT_STATUS_OPTIONS }
				/>
			) }

			<Panel>
				<PanelBody className="merodiet-table-wrap">
					{ isLoading && <p>{ __( 'Loading…', 'merodiet' ) }</p> }

					{ ! isLoading && clients.length === 0 && (
						<p>
							{ isFiltering
								? __(
										'No clients match your search.',
										'merodiet'
								  )
								: __(
										'No clients yet. Add your first client to get started.',
										'merodiet'
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
									{ __( 'Mark active', 'merodiet' ) }
								</Button>
								<Button
									variant="ghost"
									onClick={ () =>
										handleBulkMarkStatus( 'paused' )
									}
								>
									{ __( 'Mark paused', 'merodiet' ) }
								</Button>
								<Button
									variant="primary"
									destructive
									onClick={ handleBulkDelete }
								>
									{ __( 'Delete selected', 'merodiet' ) }
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
													'Select all clients',
													'merodiet'
												) }
											/>
										</th>
										<th>{ __( 'Name', 'merodiet' ) }</th>
										<th>{ __( 'Email', 'merodiet' ) }</th>
										<th>{ __( 'Account', 'merodiet' ) }</th>
										<th>
											{ __(
												'Client Portal',
												'merodiet'
											) }
										</th>
										<th>{ __( 'Added', 'merodiet' ) }</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									{ clients.map( ( client ) => (
										<tr
											key={ client.id }
											className="merodiet-row-clickable"
											onClick={ () =>
												openDetail( client.id )
											}
										>
											<td
												onClick={ ( event ) =>
													event.stopPropagation()
												}
											>
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
															'merodiet'
														),
														`${ client.first_name } ${ client.last_name }`
													) }
												/>
											</td>
											<td>
												<div className="merodiet-cell-name">
													<Avatar
														id={ client.id }
														firstName={
															client.first_name
														}
														lastName={
															client.last_name
														}
														avatarUrl={
															client.avatar_url
														}
													/>
													{ client.first_name }{ ' ' }
													{ client.last_name }
												</div>
											</td>
											<td>{ client.email }</td>
											<td>
												{ client.status === 'active' ? (
													<span
														style={ {
															color: 'var(--ink-faint)',
														} }
													>
														{ __(
															'Active',
															'merodiet'
														) }
													</span>
												) : (
													<Chip tone="clay">
														{ __(
															'Paused',
															'merodiet'
														) }
													</Chip>
												) }
											</td>
											<td>
												<Chip
													tone={
														PORTAL_STATUS[
															client.portal_status
														].tone
													}
												>
													{
														PORTAL_STATUS[
															client.portal_status
														].label
													}
												</Chip>
											</td>
											<td>
												{ formatDateTime(
													client.created_at
												) }
											</td>
											<td
												onClick={ ( event ) =>
													event.stopPropagation()
												}
											>
												<div className="merodiet-row-actions">
													<IconButton
														label={
															client.portal_status ===
															'not_invited'
																? __(
																		'Invite to client portal',
																		'merodiet'
																  )
																: __(
																		'Already invited to client portal',
																		'merodiet'
																  )
														}
														onClick={ () =>
															handleInvite(
																client
															)
														}
														disabled={
															client.portal_status !==
															'not_invited'
														}
													>
														<InviteIcon />
													</IconButton>
													<IconButton
														label={ __(
															'Remove client',
															'merodiet'
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
				title={ __( 'Add client', 'merodiet' ) }
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
				<ClientForm
					key="new"
					client={ null }
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

function InviteIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		>
			<path d="M4 6h16v12H4z" />
			<path d="m4 7 8 6 8-6" />
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
