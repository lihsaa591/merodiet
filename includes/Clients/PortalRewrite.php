<?php
/**
 * Permalink-structure-agnostic routing for the client portal.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Clients;

/**
 * A rewrite rule alone does nothing under WordPress's "Plain" permalink
 * structure — the rewrite engine isn't engaged in that mode at all. To
 * reach the portal under every structure, this class registers a public
 * query var (always active, regardless of permalink structure) AND, as
 * a purely cosmetic layer on top, a pretty rewrite rule for sites that
 * have one. url() builds whichever form matches the current site so
 * every caller (PortalPage's own redirects, a future "view portal" link
 * on the practitioner side) gets a working link without knowing which
 * permalink mode is active.
 */
final class PortalRewrite {

	/**
	 * The query var PortalPage checks on template_redirect to detect
	 * this route, regardless of which permalink structure produced the
	 * request.
	 */
	public const QUERY_VAR = 'nutrio_portal';

	/**
	 * Register the query var and, when relevant, the pretty rewrite
	 * rule. Idempotent and safe to call on every 'init' as well as
	 * directly from Activation::activate() (see that class) — the same
	 * pattern RoleRegistrar::register() already uses.
	 */
	public static function register(): void {
		add_filter(
			'query_vars',
			static function ( array $vars ): array {
				$vars[] = self::QUERY_VAR;
				return $vars;
			}
		);

		add_rewrite_rule(
			'^client-portal/?$',
			'index.php?' . self::QUERY_VAR . '=1',
			'top'
		);
	}

	/**
	 * The portal's URL, in whichever form matches this site's current
	 * permalink structure.
	 */
	public static function url(): string {
		if ( '' !== (string) get_option( 'permalink_structure', '' ) ) {
			return home_url( '/client-portal/' );
		}

		return home_url( '/?' . self::QUERY_VAR . '=1' );
	}
}
