import { __ } from '@wordpress/i18n';

// Based on the viewer's own local clock, not the site's timezone — this is
// a greeting for whoever's looking at the screen right now, same idea as a
// phone's lock-screen greeting. Emoji is kept out of the translatable
// string itself (translators shouldn't have to carry it) and appended
// separately in the same order. Shared between the admin Dashboard and the
// client portal's own Dashboard tab so the tone/thresholds stay identical.
export function greeting(): string {
	const hour = new Date().getHours();

	if ( hour < 5 ) {
		return __( 'Good night', 'nutrio' );
	}
	if ( hour < 12 ) {
		return __( 'Good morning', 'nutrio' );
	}
	if ( hour < 17 ) {
		return __( 'Good afternoon', 'nutrio' );
	}
	if ( hour < 21 ) {
		return __( 'Good evening', 'nutrio' );
	}
	return __( 'Good night', 'nutrio' );
}

export function greetingEmoji(): string {
	const hour = new Date().getHours();

	if ( hour < 5 ) {
		return '🌙';
	}
	if ( hour < 12 ) {
		return '☀️';
	}
	if ( hour < 17 ) {
		return '🌤️';
	}
	if ( hour < 21 ) {
		return '🌇';
	}
	return '🌙';
}
