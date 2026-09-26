import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import { useDispatch } from '@wordpress/data';
import { STORE_NAME } from '../../store/clients';
import Panel, { PanelBody } from '../../components/ui/Panel';
import Button from '../../components/ui/Button';
import Skeleton from '../../components/ui/Skeleton';
import Drawer from '../../components/ui/Drawer';
import LogHistoryList from '../../components/clients/LogHistoryList';
import MeasurementHistoryList from '../../components/clients/MeasurementHistoryList';
import { readStoredWeightUnit } from '../../utils/weight';
import { confirmDialog } from '../../utils/confirmDialog';
import ClientForm from './ClientForm';
import type { Client, ClientInput, LogEntry, Measurement } from '../../types';
import styles from './ClientDetail.module.css';

interface ComplianceResult {
	plan: {
		id: number;
		title: string;
		start_date: string;
		end_date: string;
	} | null;
	percent: number | null;
	logged_count: number;
	total_count: number;
}

interface ClientDetailProps {
	clientId: number;
	onBack: () => void;
}

const HISTORY_DAYS = 30;

function daysAgo( days: number ): string {
	const date = new Date();
	date.setDate( date.getDate() - days );
	return date.toISOString().slice( 0, 10 );
}

export default function ClientDetail( {
	clientId,
	onBack,
}: ClientDetailProps ) {
	const unit = readStoredWeightUnit();

	const [ client, setClient ] = useState< Client | null | undefined >(
		undefined
	);
	const [ compliance, setCompliance ] = useState<
		ComplianceResult | undefined
	>( undefined );
	const [ logs, setLogs ] = useState< LogEntry[] | undefined >( undefined );
	const [ measurements, setMeasurements ] = useState<
		Measurement[] | undefined
	>( undefined );
	const [ isDrawerOpen, setDrawerOpen ] = useState( false );
	const [ isFormDirty, setFormDirty ] = useState( false );

	const { updateClient } = useDispatch( STORE_NAME ) as {
		updateClient: (
			id: number,
			data: Partial< ClientInput >
		) => Promise< Client >;
	};

	const today = new Date().toISOString().slice( 0, 10 );

	useEffect( () => {
		apiFetch< Client >( { path: `/nutrio/v1/clients/${ clientId }` } ).then(
			setClient,
			() => setClient( null )
		);
		apiFetch< ComplianceResult >( {
			path: `/nutrio/v1/clients/${ clientId }/compliance?from=${ daysAgo(
				6
			) }&to=${ today }`,
		} ).then( setCompliance, () => setCompliance( undefined ) );
		apiFetch< LogEntry[] >( {
			path: `/nutrio/v1/clients/${ clientId }/logs?from=${ daysAgo(
				HISTORY_DAYS - 1
			) }&to=${ today }`,
		} ).then( setLogs, () => setLogs( [] ) );
		apiFetch< Measurement[] >( {
			path: `/nutrio/v1/clients/${ clientId }/measurements?from=${ daysAgo(
				HISTORY_DAYS - 1
			) }&to=${ today }`,
		} ).then( setMeasurements, () => setMeasurements( [] ) );
		// eslint-disable-next-line react-hooks/exhaustive-deps -- clientId/today are stable for the component's lifetime.
	}, [] );

	const isLoading =
		undefined === client ||
		undefined === logs ||
		undefined === measurements;

	const logsByDate: Record< string, LogEntry[] > = {};
	for ( const entry of logs ?? [] ) {
		( logsByDate[ entry.log_date ] ??= [] ).push( entry );
	}

	const closeDrawer = () => setDrawerOpen( false );

	const handleSubmit = async ( data: ClientInput ) => {
		if ( client ) {
			const updated = await updateClient( client.id, data );
			setClient( updated );
		}
		closeDrawer();
	};

	return (
		<>
			<div className="nutrio-topbar">
				<div>
					<button
						type="button"
						className={ styles.backLink }
						onClick={ onBack }
					>
						{ __( '← Back to roster', 'nutrio' ) }
					</button>
					<h1>
						{ client
							? `${ client.first_name } ${ client.last_name }`
							: __( 'Client', 'nutrio' ) }
					</h1>
				</div>
				{ client && (
					<Button
						variant="ghost"
						onClick={ () => setDrawerOpen( true ) }
					>
						{ __( 'Edit', 'nutrio' ) }
					</Button>
				) }
			</div>

			{ isLoading && (
				<div>
					<Skeleton width="60%" height="20px" />
					<Skeleton width="40%" height="16px" />
				</div>
			) }

			{ ! isLoading && (
				<>
					<Panel>
						<PanelBody>
							<h3 className={ styles.sectionTitle }>
								{ __( 'Compliance', 'nutrio' ) }
							</h3>
							{ compliance && null === compliance.plan && (
								<p className={ styles.empty }>
									{ __(
										'No active plan assigned.',
										'nutrio'
									) }
								</p>
							) }
							{ compliance && compliance.plan && (
								<div className="nutrio-kpi">
									<div className="nutrio-kpi-label">
										{ compliance.plan.title }
									</div>
									{ null === compliance.percent ? (
										<div className="nutrio-kpi-value">
											{ __(
												'No items scheduled this week',
												'nutrio'
											) }
										</div>
									) : (
										<>
											<div className="nutrio-kpi-value">
												{ compliance.percent }%
											</div>
											<div className="nutrio-kpi-delta">
												{ compliance.logged_count } /{ ' ' }
												{ compliance.total_count }{ ' ' }
												{ __(
													'items logged',
													'nutrio'
												) }
											</div>
										</>
									) }
								</div>
							) }
						</PanelBody>
					</Panel>

					<Panel>
						<PanelBody>
							<h3 className={ styles.sectionTitle }>
								{ __( 'Log history', 'nutrio' ) }
							</h3>
							<LogHistoryList entriesByDate={ logsByDate } />
						</PanelBody>
					</Panel>

					<Panel>
						<PanelBody>
							<h3 className={ styles.sectionTitle }>
								{ __( 'Measurements', 'nutrio' ) }
							</h3>
							<MeasurementHistoryList
								measurements={ measurements ?? [] }
								unit={ unit }
							/>
						</PanelBody>
					</Panel>
				</>
			) }

			{ client && (
				<Drawer
					isOpen={ isDrawerOpen }
					title={ __( 'Edit client', 'nutrio' ) }
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
						key={ client.id }
						client={ client }
						onSubmit={ handleSubmit }
						onCancel={ closeDrawer }
						onDirtyChange={ setFormDirty }
					/>
				</Drawer>
			) }
		</>
	);
}
