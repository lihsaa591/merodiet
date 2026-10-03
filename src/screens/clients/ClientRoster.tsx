import { useState } from '@wordpress/element';
import { useSelect, useDispatch } from '@wordpress/data';
import { __, sprintf } from '@wordpress/i18n';
import { STORE_NAME } from '../../store/clients';
import { confirmDialog, alertDialog } from '../../utils/confirmDialog';
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
	{ value: '', label: __( 'All statuses', 'nutrio' ) },
	{ value: 'active', label: __( 'Active', 'nutrio' ) },
	{ value: 'paused', label: __( 'Paused', 'nutrio' ) },
];

const PORTAL_STATUS = {
	not_invited: {
		label: __( 'Not invited', 'nutrio' ),
		tone: 'clay' as const,
	},
	invited: { label: __( 'Invited', 'nutrio' ), tone: 'sage' as const },
	active: { label: __( 'Joined', 'nutrio' ), tone: 'success' as const },
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
			await alertDialog( {
				title: __( 'Client added, but the invite failed', 'nutrio' ),
				message: sprintf(
					/* translators: 1: client's name, 2: the reason the invite failed */
					__(
						'%1$s did save, but the portal invite could not be sent: %2$s. You can invite them manually from the roster.',
						'nutrio'
					),
					`${ created.first_name } ${ created.last_name }`,
					created.invite_error
				),
			} );
		}
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

	const handleInvite = async ( client: Client ) => {
		try {
			await inviteClient( client.id );
			await alertDialog( {
				message: sprintf(
					/* translators: %s: client's full name */
					__( '%s has been invited to the client portal.', 'nutrio' ),
					`${ client.first_name } ${ client.last_name }`
				),
			} );
		} catch ( error ) {
			// apiFetch rejects with the REST API's error envelope
			// ({code, message, data}), not a native Error.
			const message =
				error &&
				typeof error === 'object' &&
				'message' in error &&
				typeof error.message === 'string'
					? error.message
					: __(
							'Could not send the invite. Please try again.',
							'nutrio'
					  );

			await alertDialog( { message } );
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
										<th>{ __( 'Account', 'nutrio' ) }</th>
										<th>
											{ __( 'Client Portal', 'nutrio' ) }
										</th>
										<th>{ __( 'Added', 'nutrio' ) }</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									{ clients.map( ( client ) => (
										<tr
											key={ client.id }
											className="nutrio-row-clickable"
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
												{ client.status === 'active' ? (
													<span
														style={ {
															color: 'var(--ink-faint)',
														} }
													>
														{ __(
															'Active',
															'nutrio'
														) }
													</span>
												) : (
													<Chip tone="clay">
														{ __(
															'Paused',
															'nutrio'
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
												<div className="nutrio-row-actions">
													<IconButton
														label={
															client.portal_status ===
															'not_invited'
																? __(
																		'Invite to client portal',
																		'nutrio'
																  )
																: __(
																		'Already invited to client portal',
																		'nutrio'
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
				title={ __( 'Add client', 'nutrio' ) }
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
