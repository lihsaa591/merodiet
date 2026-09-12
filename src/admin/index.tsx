import { createRoot } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import '../styles/tokens.css';
import '../styles/base.css';
import '../store/clients';
import '../store/recipes';
import App from './App';

const settings = window.nutrioAdmin ?? {};

// Point api-fetch at this site's REST root and authenticate as the logged-in user.
if ( settings.restUrl ) {
	apiFetch.use( apiFetch.createRootURLMiddleware( settings.restUrl ) );
}
if ( settings.restNonce ) {
	apiFetch.use( apiFetch.createNonceMiddleware( settings.restNonce ) );
}

domReady( () => {
	const el = document.getElementById( settings.mountId ?? 'nutrio-admin-app' );

	if ( el ) {
		createRoot( el ).render( <App /> );
	}

	if ( settings.isDevelopment ) {
		watchForRebuilds();
	}
} );

function domReady( callback: () => void ): void {
	if ( document.readyState !== 'loading' ) {
		callback();
		return;
	}

	document.addEventListener( 'DOMContentLoaded', callback );
}

/**
 * `wp-scripts start` rebuilds admin.js on save but nothing tells an already-
 * open wp-admin tab to refresh — there's no dev-server client injected into
 * wp-admin the way a typical SPA setup has. This polls the same script tag's
 * own URL and reloads once its Last-Modified header moves, so edits show up
 * without a manual refresh. Development-only — never runs in production.
 */
function watchForRebuilds(): void {
	const script = document.querySelector< HTMLScriptElement >( 'script[src*="admin.js"]' );

	if ( ! script ) {
		return;
	}

	const scriptUrl = script.src;
	let lastModified: string | null = null;
	let stopped = false;
	let timer: ReturnType< typeof setTimeout > | undefined;

	// Stop polling once this page is left — a bfcache restore or repeat
	// navigation otherwise leaves a previous poll loop running forever
	// alongside the new page's own, piling up aborted requests.
	window.addEventListener( 'pagehide', () => {
		stopped = true;
		clearTimeout( timer );
	} );

	// A recursive timeout (not setInterval) so the next poll only starts
	// once the previous request has actually finished, instead of firing
	// on a fixed clock regardless of how long the request took.
	const poll = async () => {
		try {
			const response = await fetch( scriptUrl, { method: 'HEAD', cache: 'no-store' } );
			const current = response.headers.get( 'last-modified' );

			if ( lastModified === null ) {
				lastModified = current;
			} else if ( current && current !== lastModified ) {
				window.location.reload();
				return;
			}
		} catch {
			// Dev server not reachable right now — try again next tick.
		}

		if ( ! stopped ) {
			timer = setTimeout( poll, 1500 );
		}
	};

	timer = setTimeout( poll, 1500 );
}
