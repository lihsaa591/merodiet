import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { applyFilters, doAction } from '@wordpress/hooks';
import PlanTab from './PlanTab';
import LogTab from './LogTab';
import MeasurementsTab from './MeasurementsTab';
import PortalSidebar from './PortalSidebar';

export interface Section {
	id: string;
	label: string;
	component: () => JSX.Element;
}

// The built-in sections. A future add-on's own bundle (enqueued via the
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

/**
 * Reads ?view= from the current URL, falling back to the first section.
 * @param sections The currently registered sections.
 */
function sectionFromLocation( sections: Section[] ): string {
	const id = new URLSearchParams( window.location.search ).get( 'view' );

	return id && sections.some( ( section ) => section.id === id )
		? id
		: sections[ 0 ]?.id ?? 'plan';
}

export default function App() {
	const sections: Section[] = applyFilters(
		'nutrio.clientPortal.sections',
		DEFAULT_SECTIONS
	) as Section[];

	const [ activeId, setActiveId ] = useState( () =>
		sectionFromLocation( sections )
	);
	const [ isSidebarOpen, setSidebarOpen ] = useState( false );
	const active = sections.find( ( section ) => section.id === activeId );

	doAction( 'nutrio.clientPortal.mounted' );

	// Keep the browser's back/forward buttons working.
	useEffect( () => {
		const onPopState = () => setActiveId( sectionFromLocation( sections ) );

		window.addEventListener( 'popstate', onPopState );
		return () => window.removeEventListener( 'popstate', onPopState );
		// eslint-disable-next-line react-hooks/exhaustive-deps -- sections only ever changes via a filter evaluated once at mount, not per render.
	}, [] );

	const selectSection = ( id: string ) => {
		setActiveId( id );
		setSidebarOpen( false );

		const url = new URL( window.location.href );
		url.searchParams.set( 'view', id );
		window.history.pushState( { view: id }, '', url );
	};

	return (
		<div className="nutrio-client-portal-app">
			<button
				className="nutrio-mobile-menu-btn"
				onClick={ () => setSidebarOpen( ( open ) => ! open ) }
				aria-label={ __( 'Open menu', 'nutrio' ) }
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<path d="M3 6h18M3 12h18M3 18h18" />
				</svg>
			</button>
			<div
				className={ `nutrio-rail-scrim ${
					isSidebarOpen ? 'is-open' : ''
				}`.trim() }
				role="button"
				tabIndex={ -1 }
				aria-label={ __( 'Close menu', 'nutrio' ) }
				onClick={ () => setSidebarOpen( false ) }
				onKeyDown={ ( event ) => {
					if ( 'Escape' === event.key || 'Enter' === event.key ) {
						setSidebarOpen( false );
					}
				} }
			/>

			<div className="nutrio-shell">
				<PortalSidebar
					isOpen={ isSidebarOpen }
					sections={ sections }
					activeId={ activeId }
					onSelect={ selectSection }
				/>

				<div className="nutrio-main">
					<div className="nutrio-view">
						{ active ? <active.component /> : null }
					</div>
				</div>
			</div>
		</div>
	);
}
