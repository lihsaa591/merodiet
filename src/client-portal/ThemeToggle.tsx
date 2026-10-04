import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

const STORAGE_KEY = 'nutrio-theme';

type Theme = 'light' | 'dark';

function readInitialTheme(): Theme {
	try {
		const explicit = document.documentElement.getAttribute( 'data-theme' );

		if ( 'dark' === explicit || 'light' === explicit ) {
			return explicit;
		}
	} catch {
		// Falls through to the system-preference check below.
	}

	return window.matchMedia?.( '(prefers-color-scheme: dark)' ).matches
		? 'dark'
		: 'light';
}

// Same localStorage key and data-theme mechanism the login page's own
// (vanilla-JS, since that page has no React runtime) toggle uses, so a
// choice made on either screen carries over to the other.
export default function ThemeToggle() {
	const [ theme, setTheme ] = useState< Theme >( readInitialTheme );

	const toggleTheme = () => {
		const next: Theme = 'dark' === theme ? 'light' : 'dark';
		document.documentElement.setAttribute( 'data-theme', next );
		setTheme( next );

		try {
			window.localStorage.setItem( STORAGE_KEY, next );
		} catch {
			// Storage unavailable (private browsing, blocked) — the
			// choice just won't persist across reloads.
		}
	};

	return (
		<button
			type="button"
			className="nutrio-theme-toggle"
			onClick={ toggleTheme }
			aria-label={ __( 'Toggle dark mode', 'nutrio' ) }
			title={ __( 'Toggle dark mode', 'nutrio' ) }
		>
			{ 'dark' === theme ? <MoonIcon /> : <SunIcon /> }
		</button>
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
