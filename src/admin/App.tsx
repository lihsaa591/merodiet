import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { hasUnsavedChanges } from '../hooks/useGlobalDirtyState';
import Sidebar from './Sidebar';
import Dashboard from '../screens/dashboard/Dashboard';
import ClientRoster from '../screens/clients/ClientRoster';
import RecipeScreen from '../screens/recipes/RecipeScreen';
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
	recipes: { render: () => <RecipeScreen /> },
	plans: {
		render: () => (
			<ComingSoon
				title={ __( 'Meal plans', 'nutrio' ) }
				label={ __( 'Plan builder coming soon.', 'nutrio' ) }
			/>
		),
	},
	foods: {
		render: () => (
			<ComingSoon
				title={ __( 'Food database', 'nutrio' ) }
				label={ __(
					'Cached USDA lookups, shared across your recipes.',
					'nutrio'
				) }
			/>
		),
	},
	settings: {
		render: () => (
			<ComingSoon
				title={ __( 'Settings', 'nutrio' ) }
				label={ __(
					'USDA API key, practice details, licensing.',
					'nutrio'
				) }
			/>
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

	// Keep the browser's back/forward buttons working — but if the current
	// screen has unsaved changes, confirm first and, if declined, push the
	// old URL straight back on (the browser's own history already moved).
	useEffect( () => {
		const onPopState = () => {
			if (
				hasUnsavedChanges() &&
				// eslint-disable-next-line no-alert
				! window.confirm( __( 'Discard unsaved changes?', 'nutrio' ) )
			) {
				const url = new URL( window.location.href );
				url.searchParams.set( 'view', activeView );
				window.history.pushState( { view: activeView }, '', url );
				return;
			}

			setActiveView( viewFromLocation() );
		};

		window.addEventListener( 'popstate', onPopState );
		return () => window.removeEventListener( 'popstate', onPopState );
	}, [ activeView ] );

	// Warn on an actual page unload (refresh, close tab, typed URL, external
	// link) — the browser shows its own generic prompt; custom text isn't
	// permitted by any modern browser.
	useEffect( () => {
		const onBeforeUnload = ( event: BeforeUnloadEvent ) => {
			if ( hasUnsavedChanges() ) {
				event.preventDefault();
				event.returnValue = '';
			}
		};

		window.addEventListener( 'beforeunload', onBeforeUnload );
		return () =>
			window.removeEventListener( 'beforeunload', onBeforeUnload );
	}, [] );

	const selectView = ( id: string ) => {
		if (
			hasUnsavedChanges() &&
			// eslint-disable-next-line no-alert
			! window.confirm( __( 'Discard unsaved changes?', 'nutrio' ) )
		) {
			return;
		}

		setActiveView( id );
		setSidebarOpen( false );

		const url = new URL( window.location.href );
		url.searchParams.set( 'view', id );
		url.searchParams.delete( 'id' ); // don't carry a stale id into a different screen
		window.history.pushState( { view: id }, '', url );
	};

	return (
		<div className="nutrio-admin-app">
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
				onClick={ () => setSidebarOpen( false ) }
			/>

			<div className="nutrio-shell">
				<Sidebar
					isOpen={ isSidebarOpen }
					activeView={ activeView }
					onSelect={ selectView }
				/>

				<div className="nutrio-main">
					<div className="nutrio-view">{ view.render() }</div>
				</div>
			</div>
		</div>
	);
}
