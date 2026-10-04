<?php
/**
 * Plugin activation.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio;

use Nutrio\Clients\PortalRewrite;
use Nutrio\Database\Migrator;
use Nutrio\Email\DigestScheduler;
use Nutrio\Roles\RoleRegistrar;

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
		$migrator = new Migrator( NUTRIO_PATH . 'database/migrations', 'nutrio_applied_migrations' );
		$migrator->migrate();

		update_option( 'nutrio_db_version', NUTRIO_VERSION );

		RoleRegistrar::register();
		PortalRewrite::register();

		flush_rewrite_rules();

		DigestScheduler::reschedule();
	}
}
