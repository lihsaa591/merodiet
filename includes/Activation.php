<?php
/**
 * Plugin activation.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet;

use MeroDiet\Clients\PortalRewrite;
use MeroDiet\Database\Migrator;
use MeroDiet\Email\DigestScheduler;
use MeroDiet\Roles\RoleRegistrar;

/**
 * Deliberately self-contained: activation hooks run outside the normal
 * plugins_loaded lifecycle, so this does NOT depend on Plugin::run()
 * having booted the container — it builds what it needs directly.
 */
final class Activation {

	/**
	 * Run pending migrations, sync roles, and flush rewrite rules on activation.
	 */
	public static function activate(): void {
		$migrator = new Migrator( MERODIET_PATH . 'database/migrations', 'merodiet_applied_migrations' );
		$migrator->migrate();

		update_option( 'merodiet_db_version', MERODIET_VERSION );

		RoleRegistrar::register();
		PortalRewrite::register();

		flush_rewrite_rules();

		DigestScheduler::reschedule();
	}
}
