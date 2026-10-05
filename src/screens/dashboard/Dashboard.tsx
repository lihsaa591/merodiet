import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { useSelect } from '@wordpress/data';
import { __ } from '@wordpress/i18n';
import { STORE_NAME } from '../../store/clients';
import { STORE_NAME as RECIPES_STORE } from '../../store/recipes';
import Panel, { PanelBody, PanelHead } from '../../components/ui/Panel';
import Avatar from '../../components/ui/Avatar';
import Skeleton from '../../components/ui/Skeleton';
import { greeting, greetingEmoji } from '../../utils/greeting';
import { clientDetailUrl } from '../../utils/clientUrl';
import type { Client, Recipe } from '../../types';
import type { ReactNode } from 'react';

interface ComplianceEntry {
	client_id: number;
	first_name: string;
	last_name: string;
	percent: number;
}

interface DashboardOverview {
	active_client_count: number;
	clients_without_plan_count: number;
	logged_today_count: number;
	draft_plan_count: number;
	compliance: ComplianceEntry[];
}

interface ClientsStoreSelectors {
	getClients: () => Client[];
	getClientsTotal: () => number;
}

interface RecipesStoreSelectors {
	getRecipes: () => Recipe[];
	getRecipesTotal: () => number;
}

export default function Dashboard() {
	const clientCount = useSelect( ( select ) => {
		const store = select( STORE_NAME ) as unknown as ClientsStoreSelectors;
		// Triggers the same resolver getClients() uses, so the total is
		// populated once that fetch resolves.
		store.getClients();
		return store.getClientsTotal();
	}, [] );

	const recipeCount = useSelect( ( select ) => {
		const store = select(
			RECIPES_STORE
		) as unknown as RecipesStoreSelectors;
		store.getRecipes();
		return store.getRecipesTotal();
	}, [] );

	const [ overview, setOverview ] = useState< DashboardOverview | undefined >(
		undefined
	);

	useEffect( () => {
		apiFetch< DashboardOverview >( {
			path: '/merodiet/v1/dashboard/overview',
		} ).then( setOverview, () =>
			setOverview( {
				active_client_count: 0,
				clients_without_plan_count: 0,
				logged_today_count: 0,
				draft_plan_count: 0,
				compliance: [],
			} )
		);
	}, [] );

	return (
		<>
			<div className="merodiet-topbar">
				<div>
					<h1>
						{ greeting() } { greetingEmoji() }
					</h1>
					<div className="merodiet-topbar-sub">
						{ new Date().toLocaleDateString( undefined, {
							weekday: 'long',
							month: 'long',
							day: 'numeric',
						} ) }
						{ ' · ' }
						{ clientCount } { __( 'active clients', 'merodiet' ) }
					</div>
				</div>
			</div>

			<div className="merodiet-kpi-row">
				<Kpi
					label={ __( 'Active clients', 'merodiet' ) }
					value={ clientCount }
				/>
				<Kpi
					label={ __( 'Logged today', 'merodiet' ) }
					value={
						overview ? (
							`${ overview.logged_today_count }/${
								overview.active_client_count -
								overview.clients_without_plan_count
							}`
						) : (
							<Skeleton width="50px" height="26px" />
						)
					}
					tone="up"
				/>
				<Kpi
					label={ __( 'Plans awaiting review', 'merodiet' ) }
					value={
						overview ? (
							overview.draft_plan_count
						) : (
							<Skeleton width="30px" height="26px" />
						)
					}
					delta="needs approval"
					tone="warn"
				/>
				<Kpi
					label={ __( 'Recipe library', 'merodiet' ) }
					value={ recipeCount }
				/>
			</div>

			<Panel>
				<PanelHead>
					<h3>
						{ __( 'Client compliance, last 7 days', 'merodiet' ) }
					</h3>
				</PanelHead>
				<PanelBody>
					{ ( overview?.compliance ?? [] ).map( ( client ) => (
						<ComplianceRow
							key={ client.client_id }
							client={ client }
						/>
					) ) }
					{ overview && overview.clients_without_plan_count > 0 && (
						<p>
							{ overview.clients_without_plan_count }{ ' ' }
							{ __(
								'client(s) have no active plan.',
								'merodiet'
							) }
						</p>
					) }
				</PanelBody>
			</Panel>
		</>
	);
}

interface KpiProps {
	label: string;
	value: string | number | ReactNode;
	delta?: string;
	tone?: 'up' | 'warn';
}

function Kpi( { label, value, delta, tone }: KpiProps ) {
	return (
		<div className="merodiet-kpi">
			<div className="merodiet-kpi-label">{ label }</div>
			<div className="merodiet-kpi-value">{ value }</div>
			{ delta && (
				<div
					className={ `merodiet-kpi-delta ${
						tone ? `is-${ tone }` : ''
					}`.trim() }
				>
					{ delta }
				</div>
			) }
		</div>
	);
}

function complianceTone( percent: number ): string {
	if ( percent >= 70 ) {
		return 'var(--success)';
	}
	if ( percent >= 40 ) {
		return 'var(--warning)';
	}
	return 'var(--critical)';
}

function ComplianceRow( { client }: { client: ComplianceEntry } ) {
	const barTone = complianceTone( client.percent );
	const displayName = `${ client.first_name } ${ client.last_name }`.trim();

	return (
		<a
			href={ clientDetailUrl( client.client_id ) }
			style={ {
				display: 'flex',
				alignItems: 'center',
				gap: '12px',
				padding: '10px 0',
				borderBottom: '1px solid var(--line)',
				color: 'inherit',
				textDecoration: 'none',
			} }
		>
			<Avatar
				id={ client.client_id }
				firstName={ client.first_name }
				lastName={ client.last_name }
				size="lg"
			/>
			<div style={ { width: '110px', minWidth: 0 } }>
				<div
					style={ {
						fontWeight: 600,
						fontSize: '13.5px',
						whiteSpace: 'nowrap',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
					} }
					title={ displayName }
				>
					{ displayName }
				</div>
			</div>
			<div
				style={ {
					flex: 1,
					height: '6px',
					borderRadius: '4px',
					background: 'var(--paper-dim)',
					overflow: 'hidden',
				} }
			>
				<div
					style={ {
						height: '100%',
						borderRadius: '4px',
						width: `${ client.percent }%`,
						background: barTone,
					} }
				/>
			</div>
			<div
				className="merodiet-mono"
				style={ {
					fontSize: '12.5px',
					fontWeight: 700,
					width: '34px',
					textAlign: 'right',
				} }
			>
				{ client.percent }%
			</div>
		</a>
	);
}
