<?php
/**
 * Uninstall routine.
 *
 * WordPress only includes this file when the plugin is deleted from the
 * Plugins screen (or via WP-CLI `wp plugin delete`), never on ordinary
 * deactivation — so it is the correct place for genuinely destructive
 * cleanup, and the ONLY place it should live.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

// If this file is not called by WordPress, bail.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

// Nutrio's own bookkeeping options — not client data, safe to always remove.
delete_option( 'nutrio_db_version' );
delete_option( 'nutrio_applied_migrations' );

global $wpdb;

remove_role( 'practitioner' );
remove_role( 'nutrition_client' );

/*
 * Dropping tables containing real client data (names, health goals,
 * allergies, food logs) is exactly the kind of destructive default a
 * boilerplate should never ship with — this only runs if the site
 * owner explicitly opted in, e.g. via a "delete my data on uninstall"
 * setting exposed in a future admin screen.
 */
if ( '1' !== get_option( 'nutrio_delete_data_on_uninstall' ) ) {
	return;
}

$nutrio_tables = array(
	'nutrio_log_entries',
	'nutrio_measurements',
	'nutrio_plan_items',
	'nutrio_plan_days',
	'nutrio_plans',
	'nutrio_recipe_items',
	'nutrio_recipes',
	'nutrio_foods',
	'nutrio_clients',
);

foreach ( $nutrio_tables as $nutrio_table ) {
	$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}{$nutrio_table}" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name built from a fixed internal list, not user input.
}

delete_option( 'nutrio_delete_data_on_uninstall' );
