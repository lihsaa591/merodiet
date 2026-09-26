import { createRoot } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import '../styles/tokens.css';
import '../styles/base.css';
import App from './App';
import { nonceMiddleware } from './nonceMiddleware';

const settings = window.nutrioClientPortal ?? {};

// Point api-fetch at this site's REST root and authenticate as the logged-in user.
if ( settings.restUrl ) {
	apiFetch.use( apiFetch.createRootURLMiddleware( settings.restUrl ) );
}
if ( settings.restNonce ) {
	nonceMiddleware.nonce = settings.restNonce;
	apiFetch.use( nonceMiddleware );
}

domReady( () => {
	const el = document.getElementById(
		settings.mountId ?? 'nutrio-client-portal-app'
	);

	if ( el ) {
		createRoot( el ).render( <App /> );
	}
} );

function domReady( callback: () => void ): void {
	if ( document.readyState !== 'loading' ) {
		callback();
		return;
	}

	document.addEventListener( 'DOMContentLoaded', callback );
}
