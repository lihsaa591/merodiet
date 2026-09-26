<?php
/**
 * Plugin Name:       Nutrio
 * Plugin URI:        https://github.com/nutrio/nutrio
 * Description:       Practice management for registered dietitians and nutritionists — meal planning, client compliance tracking, and USDA-backed nutrient calculations.
 * Version:           0.1.1
 * Requires at least: 6.4
 * Requires PHP:      8.1
 * Author:            Nutrio Contributors
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       nutrio
 * Domain Path:       /languages
 *
 * @package Nutrio
 */

declare( strict_types=1 );

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'NUTRIO_VERSION', '0.1.1' );
define( 'NUTRIO_FILE', __FILE__ );
define( 'NUTRIO_PATH', plugin_dir_path( __FILE__ ) );
define( 'NUTRIO_URL', plugin_dir_url( __FILE__ ) );
define( 'NUTRIO_BASENAME', plugin_basename( __FILE__ ) );

// Defaults to false (production-safe) regardless of WP_DEBUG — WP_DEBUG is
// commonly on for error logging alone on staging/dev sites that never run
// `npm start`, and this constant used to piggyback on it, which made the
// plugin try to load its JS from a webpack-dev-server that isn't running on
// any such site, breaking the whole admin/portal UI. A site's wp-config.php
// must explicitly `define( 'NUTRIO_DEVELOPMENT', true )` before the plugin
// loads to opt into dev-server script loading — see README's Development
// section.
if ( ! defined( 'NUTRIO_DEVELOPMENT' ) ) {
	define( 'NUTRIO_DEVELOPMENT', false );
}

// Where `npm start` (webpack-dev-server) serves the build from — overridable
// the same way, in case a setup runs it on a different port.
if ( NUTRIO_DEVELOPMENT && ! defined( 'NUTRIO_DEV_SERVER_URL' ) ) {
	define( 'NUTRIO_DEV_SERVER_URL', 'http://localhost:8887' );
}

// Composer autoloader.
$nutrio_autoloader = NUTRIO_PATH . 'vendor/autoload.php';

if ( ! file_exists( $nutrio_autoloader ) ) {
	add_action(
		'admin_notices',
		static function () {
			printf(
				'<div class="notice notice-error"><p>%s</p></div>',
				esc_html__( 'Nutrio: run "composer install" before activating this plugin.', 'nutrio' )
			);
		}
	);
	return;
}

require_once $nutrio_autoloader;

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
		require_once NUTRIO_PATH . 'bootstrap/app.php';
	},
	9 // Before default priority 10, so dependents can hook in at 10+.
);

register_activation_hook( __FILE__, array( \Nutrio\Activation::class, 'activate' ) );
register_deactivation_hook( __FILE__, array( \Nutrio\Deactivation::class, 'deactivate' ) );
