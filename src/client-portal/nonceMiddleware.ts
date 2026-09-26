import apiFetch from '@wordpress/api-fetch';

/**
 * Shared reference to the nonce middleware installed in index.tsx, so a
 * route that rotates the session (e.g. POST /me/password, via wp_signon())
 * can hand api-fetch a fresh nonce instead of leaving every later request
 * 403ing against the old one.
 */
export const nonceMiddleware = apiFetch.createNonceMiddleware( '' );
