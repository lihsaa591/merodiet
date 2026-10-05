<?php
/**
 * Plugin Name:       MeroDiet – Dietitian Practice Manager
 * Plugin URI:        https://github.com/lihsaa591/merodiet
 * Description:       Dietitian and nutritionist practice manager: client records, meal plans, food logs and USDA nutrition data in one dashboard.
 * Version:           0.1.0
 * Requires at least: 6.9
 * Requires PHP:      8.1
 * Author:            Aashil
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       merodiet
 * Domain Path:       /languages
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'MERODIET_VERSION', '0.1.0' );
define( 'MERODIET_FILE', __FILE__ );
define( 'MERODIET_PATH', plugin_dir_path( __FILE__ ) );
define( 'MERODIET_URL', plugin_dir_url( __FILE__ ) );
define( 'MERODIET_BASENAME', plugin_basename( __FILE__ ) );

// Defaults to false (production-safe) regardless of WP_DEBUG — WP_DEBUG is
// commonly on for error logging alone on staging/dev sites that never run
// `npm start`, and this constant used to piggyback on it, which made the
// plugin try to load its JS from a webpack-dev-server that isn't running on
// any such site, breaking the whole admin/portal UI. A site's wp-config.php
// must explicitly `define( 'MERODIET_DEVELOPMENT', true )` before the plugin
// loads to opt into dev-server script loading — see README's Development
// section.
if ( ! defined( 'MERODIET_DEVELOPMENT' ) ) {
	define( 'MERODIET_DEVELOPMENT', false );
}

// Where `npm start` (webpack-dev-server) serves the build from — overridable
// the same way, in case a setup runs it on a different port.
if ( MERODIET_DEVELOPMENT && ! defined( 'MERODIET_DEV_SERVER_URL' ) ) {
	define( 'MERODIET_DEV_SERVER_URL', 'http://localhost:8887' );
}

// Composer autoloader.
$merodiet_autoloader = MERODIET_PATH . 'vendor/autoload.php';

if ( ! file_exists( $merodiet_autoloader ) ) {
	add_action(
		'admin_notices',
		static function () {
			printf(
				'<div class="notice notice-error"><p>%s</p></div>',
				esc_html__( 'MeroDiet: run "composer install" before activating this plugin.', 'merodiet' )
			);
		}
	);
	return;
}

require_once $merodiet_autoloader;

/**
 * Boot the plugin.
 *
 * Deferred to init (not plugins_loaded): config/app.php calls __() while
 * building its config array, and WordPress 6.7+ triggers a
 * _doing_it_wrong() notice for any translation call made before init for
 * a domain not yet loaded — which, under WP_DEBUG_DISPLAY, gets echoed
 * into the response body and corrupts every later header() call on the
 * same request (REST discovery, login redirects, nonce cookies).
 */
add_action(
	'init',
	static function () {
		require_once MERODIET_PATH . 'bootstrap/app.php';
	},
	9 // Before default priority 10, so dependents can hook in at 10+.
);

register_activation_hook( __FILE__, array( \MeroDiet\Activation::class, 'activate' ) );
register_deactivation_hook( __FILE__, array( \MeroDiet\Deactivation::class, 'deactivate' ) );
