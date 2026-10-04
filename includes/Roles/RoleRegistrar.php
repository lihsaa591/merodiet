<?php
/**
 * Custom role registration.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Roles;

/**
 * Registers the two roles Nutrio introduces. Idempotent and safe to
 * call on every activation (not just the first): if a role already
 * exists, its capability set is still synced to what's defined here,
 * so a future release adding a new capability doesn't silently skip
 * sites that already have the role from an earlier version.
 */
final class RoleRegistrar {

	/**
	 * A client belongs to exactly one practitioner (v1 is
	 * single-practitioner; see non-goals). These capabilities gate the
	 * REST routes Phase 2 introduces.
	 *
	 * @var string[]
	 */
	private const PRACTITIONER_CAPS = array(
		'read',
		'manage_nutrio_clients',
		'manage_nutrio_recipes',
		'manage_nutrio_plans',
		'manage_nutrio_foods',
		'manage_nutrio_settings',
	);

	/**
	 * A client's own portal account. Deliberately minimal — 'read' is
	 * what WordPress requires for a user to access wp-admin at all
	 * (e.g. their own profile screen); the custom capability gates
	 * Phase 3's client-portal REST routes.
	 *
	 * @var string[]
	 */
	private const CLIENT_CAPS = array(
		'read',
		'view_own_nutrio_plan',
	);

	/**
	 * Register (or sync) both roles.
	 */
	public static function register(): void {
		// Role labels aren't translated: WordPress freezes them in the DB at
		// creation time, in whatever locale was active then, so translating
		// here would be both wrong (runs before init, before textdomain load)
		// and pointless (never re-translates on locale change anyway).
		self::sync_role( 'practitioner', 'Practitioner', self::PRACTITIONER_CAPS );
		self::sync_role( 'nutrition_client', 'Nutrition Client', self::CLIENT_CAPS );

		// Site admins can always manage Nutrio, same as any other plugin's capabilities.
		$administrator = get_role( 'administrator' );

		if ( null !== $administrator ) {
			foreach ( self::PRACTITIONER_CAPS as $capability ) {
				$administrator->add_cap( $capability );
			}
		}
	}

	/**
	 * Create the role if missing, then ensure every capability in
	 * $capabilities is granted — safe to run repeatedly.
	 *
	 * @param string   $role         Role slug.
	 * @param string   $display_name Human-readable role name.
	 * @param string[] $capabilities Capabilities this role must have.
	 */
	private static function sync_role( string $role, string $display_name, array $capabilities ): void {
		$existing = get_role( $role );

		if ( null === $existing ) {
			add_role( $role, $display_name, array() );
			$existing = get_role( $role );
		}

		if ( null === $existing ) {
			return; // add_role() failed (e.g. reserved name) — nothing more we can do.
		}

		foreach ( $capabilities as $capability ) {
			if ( ! $existing->has_cap( $capability ) ) {
				$existing->add_cap( $capability );
			}
		}
	}

	/**
	 * Remove both roles. Only called from uninstall.php, never on plain
	 * deactivation — see that file's own docblock for why.
	 */
	public static function remove(): void {
		remove_role( 'practitioner' );
		remove_role( 'nutrition_client' );
	}
}
