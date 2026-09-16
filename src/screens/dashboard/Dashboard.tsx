import { useSelect } from '@wordpress/data';
import { __ } from '@wordpress/i18n';
import { STORE_NAME } from '../../store/clients';
import { STORE_NAME as RECIPES_STORE } from '../../store/recipes';
import Panel, { PanelBody, PanelHead } from '../../components/ui/Panel';
import Avatar from '../../components/ui/Avatar';
import type { Client, Recipe } from '../../types';

// Compliance and activity are placeholder content — Nutrio has no log-entry
// or plan-status endpoints yet (that's Phase 3+). Active clients and Recipe
// library are the two KPIs already backed by real data.
interface ComplianceEntry {
	id: number;
	firstName: string;
	lastName: string;
	goal: string;
	percent: number;
}

const PLACEHOLDER_COMPLIANCE: ComplianceEntry[] = [
	{
		id: 1,
		firstName: 'Sam',
		lastName: 'Rivera',
		goal: 'Weight management',
		percent: 92,
	},
	{
		id: 2,
		firstName: 'Jordan',
		lastName: 'Mackey',
		goal: 'Type 2 diabetes',
		percent: 78,
	},
	{
		id: 3,
		firstName: 'Elena',
		lastName: 'Cho',
		goal: 'Prenatal',
		percent: 54,
	},
	{
		id: 4,
		firstName: 'Theo',
		lastName: 'Novak',
		goal: 'Sports performance',
		percent: 21,
	},
];

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

	return (
		<>
			<div className="nutrio-topbar">
				<div>
					<h1>{ __( 'Good morning', 'nutrio' ) }</h1>
					<div className="nutrio-topbar-sub">
						{ new Date().toLocaleDateString( undefined, {
							weekday: 'long',
							month: 'long',
							day: 'numeric',
						} ) }
						{ ' · ' }
						{ clientCount } { __( 'active clients', 'nutrio' ) }
					</div>
				</div>
			</div>

			<div className="nutrio-kpi-row">
				<Kpi
					label={ __( 'Active clients', 'nutrio' ) }
					value={ clientCount }
				/>
				<Kpi
					label={ __( 'Logged today', 'nutrio' ) }
					value="8/12"
					delta="67% compliance"
					tone="up"
				/>
				<Kpi
					label={ __( 'Plans awaiting review', 'nutrio' ) }
					value="3"
					delta="needs approval"
					tone="warn"
				/>
				<Kpi
					label={ __( 'Recipe library', 'nutrio' ) }
					value={ recipeCount }
				/>
			</div>

			<Panel>
				<PanelHead>
					<h3>
						{ __( 'Client compliance, last 7 days', 'nutrio' ) }
					</h3>
				</PanelHead>
				<PanelBody>
					{ PLACEHOLDER_COMPLIANCE.map( ( client ) => (
						<ComplianceRow key={ client.id } client={ client } />
					) ) }
				</PanelBody>
			</Panel>
		</>
	);
}

interface KpiProps {
	label: string;
	value: string | number;
	delta?: string;
	tone?: 'up' | 'warn';
}

function Kpi( { label, value, delta, tone }: KpiProps ) {
	return (
		<div className="nutrio-kpi">
			<div className="nutrio-kpi-label">{ label }</div>
			<div className="nutrio-kpi-value">{ value }</div>
			{ delta && (
				<div
					className={ `nutrio-kpi-delta ${
						tone ? `is-${ tone }` : ''
					}`.trim() }
				>
					{ delta }
				</div>
			) }
		</div>
	);
}

function ComplianceRow( { client }: { client: ComplianceEntry } ) {
	const barTone =
		client.percent >= 70
			? 'var(--success)'
			: client.percent >= 40
			? 'var(--warning)'
			: 'var(--critical)';

	return (
		<div
			style={ {
				display: 'flex',
				alignItems: 'center',
				gap: '12px',
				padding: '10px 0',
				borderBottom: '1px solid var(--line)',
			} }
		>
			<Avatar
				id={ client.id }
				firstName={ client.firstName }
				lastName={ client.lastName }
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
					title={ `${ client.firstName } ${ client.lastName }` }
				>
					{ client.firstName } { client.lastName }
				</div>
				<div style={ { fontSize: '12px', color: 'var(--ink-muted)' } }>
					{ client.goal }
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
				className="nutrio-mono"
				style={ {
					fontSize: '12.5px',
					fontWeight: 700,
					width: '34px',
					textAlign: 'right',
				} }
			>
				{ client.percent }%
			</div>
		</div>
	);
}
