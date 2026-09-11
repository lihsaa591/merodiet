<?php
/**
 * Plugin Name:       Nutrio
 * Plugin URI:        https://github.com/nutrio/nutrio
 * Description:       Practice management for registered dietitians and nutritionists — meal planning, client compliance tracking, and USDA-backed nutrient calculations.
 * Version:           0.1.0
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

define( 'NUTRIO_VERSION', '0.1.0' );
define( 'NUTRIO_FILE', __FILE__ );
define( 'NUTRIO_PATH', plugin_dir_path( __FILE__ ) );
define( 'NUTRIO_URL', plugin_dir_url( __FILE__ ) );
define( 'NUTRIO_BASENAME', plugin_basename( __FILE__ ) );

// Defaults to WP_DEBUG, but a site's wp-config.php can define this before
// the plugin loads to override it independently (e.g. WP_DEBUG on for
// error logging, without also switching Nutrio's own dev-only behavior).
if ( ! defined( 'NUTRIO_DEVELOPMENT' ) ) {
	define( 'NUTRIO_DEVELOPMENT', defined( 'WP_DEBUG' ) && WP_DEBUG );
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
 * Deferred to plugins_loaded so every other plugin's autoloader
 * and text-domain setup has already run.
 */
add_action(
	'plugins_loaded',
	static function () {
		require_once NUTRIO_PATH . 'bootstrap/app.php';
	},
	9 // Before default priority 10, so dependents can hook in at 10+.
);

register_activation_hook( __FILE__, array( \Nutrio\Activation::class, 'activate' ) );
register_deactivation_hook( __FILE__, array( \Nutrio\Deactivation::class, 'deactivate' ) );
