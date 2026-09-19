import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { applyFilters, doAction } from '@wordpress/hooks';
import PlanTab from './PlanTab';
import LogTab from './LogTab';
import MeasurementsTab from './MeasurementsTab';
import styles from './App.module.css';

export interface Section {
	id: string;
	label: string;
	component: () => JSX.Element;
}

// The built-in tabs. A future add-on's own bundle (enqueued via the
// PHP `nutrio_client_portal_render` action) can append, remove, or
// reorder entries here via the `nutrio.clientPortal.sections` filter
// below — the JS-side counterpart to the PHP
// `nutrio_client_portal_bootstrap_data` filter.
const DEFAULT_SECTIONS: Section[] = [
	{ id: 'plan', label: __( 'My Plan', 'nutrio' ), component: PlanTab },
	{ id: 'log', label: __( 'Log', 'nutrio' ), component: LogTab },
	{
		id: 'measurements',
		label: __( 'Measurements', 'nutrio' ),
		component: MeasurementsTab,
	},
];

export default function App() {
	const sections: Section[] = applyFilters(
		'nutrio.clientPortal.sections',
		DEFAULT_SECTIONS
	) as Section[];

	const [ activeId, setActiveId ] = useState( sections[ 0 ]?.id ?? 'plan' );
	const active = sections.find( ( section ) => section.id === activeId );

	doAction( 'nutrio.clientPortal.mounted' );

	const clientName = window.nutrioClientPortal?.clientName ?? '';

	return (
		<div className={ styles.shell }>
			<header className={ styles.header }>
				<h1 className={ styles.title }>
					{ __( 'Client Portal', 'nutrio' ) }
				</h1>
				{ clientName && (
					<span className={ styles.greeting }>{ clientName }</span>
				) }
			</header>
			<nav className={ styles.tabs }>
				{ sections.map( ( section ) => (
					<button
						key={ section.id }
						type="button"
						className={ `${ styles.tab } ${
							section.id === activeId ? styles.tabActive : ''
						}`.trim() }
						onClick={ () => setActiveId( section.id ) }
					>
						{ section.label }
					</button>
				) ) }
			</nav>
			<main className={ styles.content }>
				{ active ? <active.component /> : null }
			</main>
		</div>
	);
}
