import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import Sidebar from './Sidebar';
import Dashboard from '../screens/dashboard/Dashboard';
import ClientRoster from '../screens/clients/ClientRoster';
import ComingSoon from '../screens/ComingSoon';
import type { ReactNode } from 'react';

interface View {
	render: () => ReactNode;
}

// Every screen owns its full topbar (title + any primary action button, in
// one row) — App itself never renders a second, competing title above it.
// See DESIGN.md: this was a real bug on the Clients page (duplicate "Clients"
// heading, Add-client button stranded in a second row instead of the top one).
const VIEWS: Record< string, View > = {
	dashboard: { render: () => <Dashboard /> },
	clients: { render: () => <ClientRoster /> },
	recipes: {
		render: () => (
			<ComingSoon title={ __( 'Recipe builder', 'nutrio' ) } label={ __( 'Recipe builder coming soon.', 'nutrio' ) } />
		),
	},
	plans: {
		render: () => (
			<ComingSoon title={ __( 'Meal plans', 'nutrio' ) } label={ __( 'Plan builder coming soon.', 'nutrio' ) } />
		),
	},
	foods: {
		render: () => (
			<ComingSoon
				title={ __( 'Food database', 'nutrio' ) }
				label={ __( 'Cached USDA lookups, shared across your recipes.', 'nutrio' ) }
			/>
		),
	},
	settings: {
		render: () => (
			<ComingSoon title={ __( 'Settings', 'nutrio' ) } label={ __( 'USDA API key, practice details, licensing.', 'nutrio' ) } />
		),
	},
};

/** Reads ?view= from the current URL, falling back to 'dashboard'. */
function viewFromLocation(): string {
	const id = new URLSearchParams( window.location.search ).get( 'view' );

	return id && id in VIEWS ? id : 'dashboard';
}

export default function App() {
	const [ activeView, setActiveView ] = useState( viewFromLocation );
	const [ isSidebarOpen, setSidebarOpen ] = useState( false );

	const view = VIEWS[ activeView ] ?? VIEWS.dashboard;

	// Keep the browser's back/forward buttons working.
	useEffect( () => {
		const onPopState = () => setActiveView( viewFromLocation() );

		window.addEventListener( 'popstate', onPopState );
		return () => window.removeEventListener( 'popstate', onPopState );
	}, [] );

	const selectView = ( id: string ) => {
		setActiveView( id );
		setSidebarOpen( false );

		const url = new URL( window.location.href );
		url.searchParams.set( 'view', id );
		window.history.pushState( { view: id }, '', url );
	};

	return (
		<div className="nutrio-admin-app">
			<button
				className="nutrio-mobile-menu-btn"
				onClick={ () => setSidebarOpen( ( open ) => ! open ) }
				aria-label={ __( 'Open menu', 'nutrio' ) }
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
					<path d="M3 6h18M3 12h18M3 18h18" />
				</svg>
			</button>
			<div
				className={ `nutrio-rail-scrim ${ isSidebarOpen ? 'is-open' : '' }`.trim() }
				onClick={ () => setSidebarOpen( false ) }
			/>

			<div className="nutrio-shell">
				<Sidebar isOpen={ isSidebarOpen } activeView={ activeView } onSelect={ selectView } />

				<div className="nutrio-main">
					<div className="nutrio-view">{ view.render() }</div>
				</div>
			</div>
		</div>
	);
}
