import { createRoot } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import '../styles/tokens.css';
import '../styles/base.css';
import '../store/clients';
import '../store/recipes';
import '../store/plans';
import '../store/customFoods';
import App from './App';

const settings = window.merodietAdmin ?? {};

// Point api-fetch at this site's REST root and authenticate as the logged-in user.
if ( settings.restUrl ) {
	apiFetch.use( apiFetch.createRootURLMiddleware( settings.restUrl ) );
}
if ( settings.restNonce ) {
	apiFetch.use( apiFetch.createNonceMiddleware( settings.restNonce ) );
}

domReady( () => {
	const el = document.getElementById(
		settings.mountId ?? 'merodiet-admin-app'
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
