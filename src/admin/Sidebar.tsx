import { __ } from '@wordpress/i18n';
import ProUpsellModal from '../components/ui/ProUpsellModal';
import { useState } from '@wordpress/element';
import type { ReactNode } from 'react';
import merodietLogo from './merodiet-logo.png';

interface NavItem {
	id: string;
	label: string;
	icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
	{
		id: 'dashboard',
		label: __( 'Dashboard', 'merodiet' ),
		icon: (
			<>
				<rect x="3" y="3" width="8" height="8" rx="1.5" />
				<rect x="13" y="3" width="8" height="5" rx="1.5" />
				<rect x="13" y="10" width="8" height="11" rx="1.5" />
				<rect x="3" y="13" width="8" height="8" rx="1.5" />
			</>
		),
	},
	{
		id: 'clients',
		label: __( 'Clients', 'merodiet' ),
		icon: (
			<>
				<circle cx="9" cy="8" r="3.2" />
				<path d="M3.5 20c0-3.6 2.5-6 5.5-6s5.5 2.4 5.5 6" />
				<circle cx="17" cy="9" r="2.4" />
				<path d="M15.5 20c0-2.6 1.4-4.6 3.4-5.3" />
			</>
		),
	},
	{
		id: 'recipes',
		label: __( 'Recipes', 'merodiet' ),
		icon: (
			<path d="M5 3v6a3 3 0 0 0 3 3v9M8 3v6M11 3v6M17 3c-2 1-2.5 3-2.5 5.5S17 13 17 13v9" />
		),
	},
	{
		id: 'plans',
		label: __( 'Plans', 'merodiet' ),
		icon: (
			<>
				<rect x="3.5" y="4" width="17" height="16" rx="2" />
				<path d="M3.5 9h17M8 3v3M16 3v3" />
				<path d="M7.5 13h3M7.5 16.5h6" />
			</>
		),
	},
	{
		id: 'foods',
		label: __( 'Food database', 'merodiet' ),
		icon: (
			<path d="M12 3c-3.5 3-5 6-5 9a5 5 0 0 0 10 0c0-3-1.5-6-5-9ZM12 8v9" />
		),
	},
	{
		id: 'settings',
		label: __( 'Settings', 'merodiet' ),
		icon: (
			<>
				<circle cx="12" cy="12" r="3" />
				<path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V19.6a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H4.4a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H10.5a1.7 1.7 0 0 0 1-1.55V4.4a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V10.5a1.7 1.7 0 0 0 1.55 1H19.6a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
			</>
		),
	},
];

interface SidebarProps {
	isOpen: boolean;
	activeView: string;
	onSelect: ( id: string ) => void;
}

export default function Sidebar( {
	isOpen,
	activeView,
	onSelect,
}: SidebarProps ) {
	const [ isProModalOpen, setProModalOpen ] = useState( false );

	return (
		<>
			<aside
				className={ `merodiet-rail ${
					isOpen ? 'is-open' : ''
				}`.trim() }
			>
				<a
					className="merodiet-wp-back"
					href={ window.merodietAdmin?.adminUrl ?? '#' }
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<path d="M19 12H5M11 18l-6-6 6-6" />
					</svg>
					{ __( 'Back to WordPress', 'merodiet' ) }
				</a>

				<div className="merodiet-brand">
					<img
						className="merodiet-brand-mark"
						src={ merodietLogo }
						alt=""
					/>
					<div className="merodiet-brand-name">MeroDiet</div>
				</div>

				<nav className="merodiet-nav-group">
					{ NAV_ITEMS.map( ( item ) => (
						<button
							key={ item.id }
							className={ `merodiet-nav-item ${
								activeView === item.id ? 'is-active' : ''
							}`.trim() }
							onClick={ () => onSelect( item.id ) }
						>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.8"
							>
								{ item.icon }
							</svg>
							{ item.label }
						</button>
					) ) }
					<button
						className="merodiet-nav-item merodiet-nav-item-pro"
						onClick={ () => setProModalOpen( true ) }
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.8"
						>
							<path d="M4 19V9M12 19V4M20 19v-6" />
						</svg>
						{ __( 'Analytics', 'merodiet' ) }
						<svg
							className="merodiet-pro-lock"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<rect
								x="5"
								y="11"
								width="14"
								height="9"
								rx="2"
								fill="currentColor"
								stroke="none"
							/>
							<path d="M8 11V8a4 4 0 0 1 8 0v3" />
						</svg>
					</button>
				</nav>

				<RailFoot />
			</aside>

			<ProUpsellModal
				isOpen={ isProModalOpen }
				featureName={ __( 'Analytics', 'merodiet' ) }
				onClose={ () => setProModalOpen( false ) }
			/>
		</>
	);
}

function RailFoot() {
	// An explicit data-theme always wins; otherwise fall back to the
	// system preference so the toggle's first click flips the right way.
	const [ theme, setTheme ] = useState< 'light' | 'dark' >( () => {
		const explicit = document.documentElement.getAttribute( 'data-theme' );

		if ( explicit === 'dark' || explicit === 'light' ) {
			return explicit;
		}

		return window.matchMedia?.( '(prefers-color-scheme: dark)' ).matches
			? 'dark'
			: 'light';
	} );

	const toggleTheme = () => {
		const next = theme === 'dark' ? 'light' : 'dark';
		document.documentElement.setAttribute( 'data-theme', next );
		setTheme( next );
	};

	return (
		<div className="merodiet-rail-foot">
			<div className="merodiet-user-avatar">
				{ window.merodietAdmin?.currentUserInitials ?? 'U' }
			</div>
			<div style={ { flex: 1, minWidth: 0 } }>
				<div className="merodiet-rail-foot-name">
					{ window.merodietAdmin?.currentUserName ?? '' }
				</div>
				<div className="merodiet-rail-foot-role">
					{ __( 'Practitioner', 'merodiet' ) }
				</div>
			</div>
			<button
				className="merodiet-theme-toggle"
				onClick={ toggleTheme }
				aria-label={ __( 'Toggle dark mode', 'merodiet' ) }
				title={ __( 'Toggle dark mode', 'merodiet' ) }
			>
				{ theme === 'dark' ? <MoonIcon /> : <SunIcon /> }
			</button>
		</div>
	);
}

function SunIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		>
			<circle cx="12" cy="12" r="4" />
			<path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
		</svg>
	);
}

function MoonIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		>
			<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
		</svg>
	);
}
