import { __ } from '@wordpress/i18n';
import ThemeToggle from './ThemeToggle';
import type { Section } from './App';

interface PortalSidebarProps {
	isOpen: boolean;
	sections: Section[];
	activeId: string;
	onSelect: ( id: string ) => void;
}

// Deliberately mirrors src/admin/Sidebar.tsx's structure/classes exactly
// (.nutrio-rail, .nutrio-brand, .nutrio-nav-item, .nutrio-rail-foot, ...)
// so the client portal reads as the same product as the practitioner
// admin app, not a visually separate one bolted on beside it.
export default function PortalSidebar( {
	isOpen,
	sections,
	activeId,
	onSelect,
}: PortalSidebarProps ) {
	const clientName = window.nutrioClientPortal?.clientName ?? '';
	const logoutUrl = window.nutrioClientPortal?.logoutUrl ?? '#';

	return (
		<aside className={ `nutrio-rail ${ isOpen ? 'is-open' : '' }`.trim() }>
			<a className="nutrio-wp-back" href={ logoutUrl }>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
				</svg>
				{ __( 'Log out', 'nutrio' ) }
			</a>

			<div className="nutrio-brand">
				<div className="nutrio-brand-mark">N</div>
				<div className="nutrio-brand-name">Nutrio</div>
			</div>

			<nav className="nutrio-nav-group">
				{ sections.map( ( section ) => (
					<button
						key={ section.id }
						className={ `nutrio-nav-item ${
							activeId === section.id ? 'is-active' : ''
						}`.trim() }
						onClick={ () => onSelect( section.id ) }
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.8"
						>
							{ SECTION_ICONS[ section.id ] ?? (
								<circle cx="12" cy="12" r="8" />
							) }
						</svg>
						{ section.label }
					</button>
				) ) }
			</nav>

			<div className="nutrio-rail-foot">
				<div className="nutrio-user-avatar">
					{ initialsFor( clientName ) }
				</div>
				<div style={ { flex: 1, minWidth: 0 } }>
					<div className="nutrio-rail-foot-name">{ clientName }</div>
					<div className="nutrio-rail-foot-role">
						{ __( 'Client', 'nutrio' ) }
					</div>
				</div>
				<ThemeToggle />
			</div>
		</aside>
	);
}

// The built-in sections' icons — keyed by id, so a future add-on's own
// section (via the nutrio.clientPortal.sections filter) falls back to
// the generic circle above rather than rendering nothing.
const SECTION_ICONS: Record< string, JSX.Element > = {
	plan: (
		<>
			<rect x="3.5" y="4" width="17" height="16" rx="2" />
			<path d="M3.5 9h17M8 3v3M16 3v3" />
			<path d="M7.5 13h3M7.5 16.5h6" />
		</>
	),
	log: (
		<>
			<path d="M9 11l3 3L22 4" />
			<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
		</>
	),
	measurements: (
		<>
			<circle cx="12" cy="12" r="9" />
			<path d="M12 7v5l3 3" />
		</>
	),
};

/**
 * First letter of up to the first two words of a name, uppercased.
 * @param name
 */
function initialsFor( name: string ): string {
	const words = name.trim().split( /\s+/ ).filter( Boolean );

	return words
		.slice( 0, 2 )
		.map( ( word ) => word[ 0 ] )
		.join( '' )
		.toUpperCase();
}
