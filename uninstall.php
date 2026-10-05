<?php
/**
 * Uninstall routine.
 *
 * WordPress only includes this file when the plugin is deleted from the
 * Plugins screen (or via WP-CLI `wp plugin delete`), never on ordinary
 * deactivation — so it is the correct place for genuinely destructive
 * cleanup, and the ONLY place it should live.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange -- Uninstall drops the plugin's own tables from a fixed list.

// If this file is not called by WordPress, bail.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

/**
 * Remove MeroDiet's data for the current site.
 *
 * Bookkeeping options and roles always go. Tables and settings holding
 * practice data (names, health goals, allergies, food logs, the USDA key,
 * email templates) are only dropped when the site owner opted in via
 * Settings > General ("Delete all MeroDiet data when the plugin is deleted").
 */
function merodiet_uninstall_site(): void {
	global $wpdb;

	// MeroDiet's own bookkeeping options — not client data, safe to always remove.
	delete_option( 'merodiet_db_version' );
	delete_option( 'merodiet_applied_migrations' );
	delete_option( 'merodiet_portal_rewrite_flushed' );

	remove_role( 'practitioner' );
	remove_role( 'nutrition_client' );

	// Destructive cleanup only runs if the site owner explicitly opted in.
	if ( '1' !== get_option( 'merodiet_delete_data_on_uninstall' ) ) {
		return;
	}

	$merodiet_tables = array(
		'merodiet_log_entries',
		'merodiet_measurements',
		'merodiet_plan_items',
		'merodiet_plan_days',
		'merodiet_plans',
		'merodiet_recipe_items',
		'merodiet_recipes',
		'merodiet_foods',
		'merodiet_clients',
	);

	foreach ( $merodiet_tables as $merodiet_table ) {
		$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}{$merodiet_table}" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name built from a fixed internal list, not user input.
	}

	delete_option( 'merodiet_usda_api_key' );
	delete_option( 'merodiet_digest_enabled' );
	delete_option( 'merodiet_digest_time' );
	delete_option( 'merodiet_email_sender' );

	// Per-type email template options: merodiet_email_{type}.
	$wpdb->query(
		$wpdb->prepare(
			"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- core table name.
			$wpdb->esc_like( 'merodiet_email_' ) . '%'
		)
	);

	delete_option( 'merodiet_delete_data_on_uninstall' );
}

if ( is_multisite() ) {
	// Plugin tables, roles and options are per-site, so clean every site.
	foreach ( get_sites(
		array(
			'fields' => 'ids',
			'number' => 0,
		)
	) as $merodiet_site_id ) {
		switch_to_blog( (int) $merodiet_site_id );
		merodiet_uninstall_site();
		restore_current_blog();
	}
} else {
	merodiet_uninstall_site();
}
