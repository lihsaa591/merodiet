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
import { readStoredWeightUnit, gramsToDisplay } from '../../utils/weight';
import { formatShortDate } from '../../utils/date';
import { confirmDialog } from '../../utils/confirmDialog';
import { toast } from '../../utils/toast';
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

// Fetch the whole history window once and reveal it in pages client-side.
// The /logs and /measurements endpoints only filter by date (no offset
// pagination), and a client's history over this window is small, so this
// lets "Load more" show only when there is genuinely more to reveal.
const HISTORY_MAX_DAYS = 180;
const LOG_DATES_PAGE_SIZE = 7;
const MEASUREMENTS_PAGE_SIZE = 10;

type DetailTab = 'logs' | 'measurements';

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
	const [ activeTab, setActiveTab ] = useState< DetailTab >( 'logs' );
	const [ visibleLogDates, setVisibleLogDates ] =
		useState( LOG_DATES_PAGE_SIZE );
	const [ visibleMeasurements, setVisibleMeasurements ] = useState(
		MEASUREMENTS_PAGE_SIZE
	);

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
				HISTORY_MAX_DAYS - 1
			) }&to=${ today }`,
		} ).then( setLogs, () => setLogs( [] ) );
		apiFetch< Measurement[] >( {
			path: `/nutrio/v1/clients/${ clientId }/measurements?from=${ daysAgo(
				HISTORY_MAX_DAYS - 1
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
	const logDates = Object.keys( logsByDate ).sort( ( a, b ) =>
		b.localeCompare( a )
	);
	const visibleLogsByDate: Record< string, LogEntry[] > = {};
	for ( const date of logDates.slice( 0, visibleLogDates ) ) {
		visibleLogsByDate[ date ] = logsByDate[ date ];
	}

	// Same latest-weight/delta-vs-previous calculation as the
	// client-portal's own DashboardTab.tsx.
	const weighed = ( measurements ?? [] ).filter(
		( m ): m is Measurement & { weight_grams: number } =>
			null !== m.weight_grams
	);
	const latestWeight = weighed[ 0 ] ?? null;
	const weightDelta =
		weighed.length > 1
			? Math.round(
					( gramsToDisplay( weighed[ 0 ].weight_grams, unit ) -
						gramsToDisplay( weighed[ 1 ].weight_grams, unit ) ) *
						10
			  ) / 10
			: null;

	const closeDrawer = () => setDrawerOpen( false );

	const handleSubmit = async ( data: ClientInput ) => {
		if ( client ) {
			const updated = await updateClient( client.id, data );
			setClient( updated );
			toast.success( __( 'Client updated.', 'nutrio' ) );
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
						{ __( '← Back to clients', 'nutrio' ) }
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
					{ compliance && null === compliance.plan && (
						<Panel>
							<PanelBody>
								<h3 className={ styles.sectionTitle }>
									{ __( 'Compliance', 'nutrio' ) }
								</h3>
								<p className={ styles.empty }>
									{ __(
										'No active plan assigned.',
										'nutrio'
									) }
								</p>
							</PanelBody>
						</Panel>
					) }

					{ compliance && compliance.plan && (
						<div className="nutrio-kpi-row">
							<div className="nutrio-kpi">
								<div className="nutrio-kpi-label">
									{ __( 'Compliance', 'nutrio' ) }
								</div>
								{ null === compliance.percent ? (
									<div className="nutrio-kpi-value">
										{ __( 'No items scheduled', 'nutrio' ) }
									</div>
								) : (
									<>
										<div className="nutrio-kpi-value">
											{ compliance.percent }%
										</div>
										<div className="nutrio-kpi-delta">
											{ compliance.logged_count } /{ ' ' }
											{ compliance.total_count }{ ' ' }
											{ __( 'items logged', 'nutrio' ) }
										</div>
									</>
								) }
							</div>

							<div className="nutrio-kpi">
								<div className="nutrio-kpi-label">
									{ __( 'Plan', 'nutrio' ) }
								</div>
								<div className="nutrio-kpi-value">
									{ compliance.plan.title }
								</div>
								<div className="nutrio-kpi-delta">
									{ formatShortDate(
										compliance.plan.start_date
									) }{ ' ' }
									–{ ' ' }
									{ formatShortDate(
										compliance.plan.end_date
									) }
								</div>
							</div>

							<div className="nutrio-kpi">
								<div className="nutrio-kpi-label">
									{ __( 'Current weight', 'nutrio' ) }
								</div>
								<div className="nutrio-kpi-value">
									{ latestWeight
										? `${ gramsToDisplay(
												latestWeight.weight_grams,
												unit
										  ) } ${ unit }`
										: '—' }
								</div>
								{ null !== weightDelta && 0 !== weightDelta && (
									<div className="nutrio-kpi-delta">
										{ weightDelta > 0 ? '↑' : '↓' }{ ' ' }
										{ Math.abs( weightDelta ) } { unit }{ ' ' }
										{ __( 'since last', 'nutrio' ) }
									</div>
								) }
							</div>
						</div>
					) }

					<div className={ styles.tabs }>
						<button
							type="button"
							className={ `${ styles.tab } ${
								'logs' === activeTab ? styles.isActive : ''
							}`.trim() }
							onClick={ () => setActiveTab( 'logs' ) }
						>
							{ __( 'Log history', 'nutrio' ) }
						</button>
						<button
							type="button"
							className={ `${ styles.tab } ${
								'measurements' === activeTab
									? styles.isActive
									: ''
							}`.trim() }
							onClick={ () => setActiveTab( 'measurements' ) }
						>
							{ __( 'Measurements', 'nutrio' ) }
						</button>
					</div>

					{ 'logs' === activeTab && (
						<Panel>
							<PanelBody>
								<LogHistoryList
									entriesByDate={ visibleLogsByDate }
								/>
								{ logDates.length > visibleLogDates && (
									<button
										type="button"
										className={ styles.loadMore }
										onClick={ () =>
											setVisibleLogDates(
												( count ) =>
													count + LOG_DATES_PAGE_SIZE
											)
										}
									>
										{ __( 'Load more', 'nutrio' ) }
									</button>
								) }
							</PanelBody>
						</Panel>
					) }

					{ 'measurements' === activeTab && (
						<Panel>
							<PanelBody>
								<MeasurementHistoryList
									measurements={ measurements ?? [] }
									limit={ visibleMeasurements }
									unit={ unit }
								/>
								{ ( measurements ?? [] ).length >
									visibleMeasurements && (
									<button
										type="button"
										className={ styles.loadMore }
										onClick={ () =>
											setVisibleMeasurements(
												( count ) =>
													count +
													MEASUREMENTS_PAGE_SIZE
											)
										}
									>
										{ __( 'Load more', 'nutrio' ) }
									</button>
								) }
							</PanelBody>
						</Panel>
					) }
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
