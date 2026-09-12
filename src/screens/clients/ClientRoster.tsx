import { useState } from '@wordpress/element';
import { useSelect, useDispatch } from '@wordpress/data';
import { __ } from '@wordpress/i18n';
import { STORE_NAME } from '../../store/clients';
import Panel, { PanelBody } from '../../components/ui/Panel';
import Button from '../../components/ui/Button';
import Chip from '../../components/ui/Chip';
import Avatar from '../../components/ui/Avatar';
import IconButton from '../../components/ui/IconButton';
import Drawer from '../../components/ui/Drawer';
import ClientForm from './ClientForm';
import type { Client, ClientInput } from '../../types';

interface ClientsStoreSelectors {
	getClients: () => Client[];
	hasFinishedResolution: ( selector: string ) => boolean;
}

export default function ClientRoster() {
	const [ isDrawerOpen, setDrawerOpen ] = useState( false );
	const [ editingId, setEditingId ] = useState< number | null >( null );
	const [ isFormDirty, setFormDirty ] = useState( false );

	const { clients, isLoading } = useSelect( ( select ) => {
		const store = select( STORE_NAME ) as unknown as ClientsStoreSelectors;

		return {
			clients: store.getClients(),
			isLoading: ! store.hasFinishedResolution( 'getClients' ),
		};
	}, [] );

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

	const handleDelete = ( client: Client ) => {
		if (
			// eslint-disable-next-line no-alert
			window.confirm(
				__( 'Remove this client? This cannot be undone.', 'nutrio' )
			)
		) {
			deleteClient( client.id );
		}
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

			<Panel>
				<PanelBody className="nutrio-table-wrap">
					{ isLoading && <p>{ __( 'Loading…', 'nutrio' ) }</p> }

					{ ! isLoading && clients.length === 0 && (
						<p>
							{ __(
								'No clients yet. Add your first client to get started.',
								'nutrio'
							) }
						</p>
					) }

					{ ! isLoading && clients.length > 0 && (
						<table className="nutrio-table">
							<thead>
								<tr>
									<th>{ __( 'Name', 'nutrio' ) }</th>
									<th>{ __( 'Email', 'nutrio' ) }</th>
									<th>{ __( 'Allergies', 'nutrio' ) }</th>
									<th>{ __( 'Status', 'nutrio' ) }</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{ clients.map( ( client ) => (
									<tr key={ client.id }>
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
													client.status === 'active'
														? 'success'
														: 'clay'
												}
											>
												{ client.status }
											</Chip>
										</td>
										<td>
											<div className="nutrio-row-actions">
												<IconButton
													label={ __(
														'Edit client',
														'nutrio'
													) }
													onClick={ () =>
														openEdit( client.id )
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
														handleDelete( client )
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

			<Drawer
				isOpen={ isDrawerOpen }
				title={
					editingClient
						? __( 'Edit client', 'nutrio' )
						: __( 'Add client', 'nutrio' )
				}
				onClose={ closeDrawer }
				confirmClose={ () =>
					! isFormDirty ||
					// eslint-disable-next-line no-alert
					window.confirm( __( 'Discard unsaved changes?', 'nutrio' ) )
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
