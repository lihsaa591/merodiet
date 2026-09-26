import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { hasUnsavedChanges } from '../hooks/useGlobalDirtyState';
import { confirmDialog } from '../utils/confirmDialog';
import ConfirmDialogHost from '../components/ui/ConfirmDialogHost';
import Sidebar from './Sidebar';
import Dashboard from '../screens/dashboard/Dashboard';
import ClientRoster from '../screens/clients/ClientRoster';
import RecipeScreen from '../screens/recipes/RecipeScreen';
import PlanScreen from '../screens/plans/PlanScreen';
import CustomFoods from '../screens/foods/CustomFoods';
import Settings from '../screens/settings/Settings';
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
	plans: { render: () => <PlanScreen /> },
	foods: { render: () => <CustomFoods /> },
	settings: { render: () => <Settings /> },
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
	// screen has unsaved changes, revert the URL immediately (the browser's
	// own history already moved before we can ask anything) and only follow
	// through once the async confirm resolves.
	useEffect( () => {
		const onPopState = async () => {
			const targetView = viewFromLocation();

			if ( ! hasUnsavedChanges() ) {
				setActiveView( targetView );
				return;
			}

			const revertUrl = new URL( window.location.href );
			revertUrl.searchParams.set( 'view', activeView );
			window.history.pushState( { view: activeView }, '', revertUrl );

			const discard = await confirmDialog( {
				message: __( 'Discard unsaved changes?', 'nutrio' ),
				confirmLabel: __( 'Discard', 'nutrio' ),
				destructive: true,
			} );

			if ( discard ) {
				const url = new URL( window.location.href );
				url.searchParams.set( 'view', targetView );
				window.history.pushState( { view: targetView }, '', url );
				setActiveView( targetView );
			}
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

	const selectView = async ( id: string ) => {
		if ( hasUnsavedChanges() ) {
			const discard = await confirmDialog( {
				message: __( 'Discard unsaved changes?', 'nutrio' ),
				confirmLabel: __( 'Discard', 'nutrio' ),
				destructive: true,
			} );
			if ( ! discard ) {
				return;
			}
		}

		setActiveView( id );
		setSidebarOpen( false );

		const url = new URL( window.location.href );
		url.searchParams.set( 'view', id );
		url.searchParams.delete( 'id' ); // don't carry a stale id into a different screen

		// Same idea for pagination and filters — each list screen's
		// usePagination() writes its own `${prefix}_page` / `${prefix}_per_page`
		// / `${prefix}_filter_*` keys (see that hook), which would otherwise
		// just accumulate in the URL forever as the practitioner visits more
		// screens.
		for ( const key of Array.from( url.searchParams.keys() ) ) {
			if (
				key.endsWith( '_page' ) ||
				key.endsWith( '_per_page' ) ||
				key.includes( '_filter_' )
			) {
				url.searchParams.delete( key );
			}
		}

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
				<Sidebar
					isOpen={ isSidebarOpen }
					activeView={ activeView }
					onSelect={ selectView }
				/>

				<div className="nutrio-main">
					<div className="nutrio-view">{ view.render() }</div>
				</div>
			</div>
			<ConfirmDialogHost />
		</div>
	);
}
