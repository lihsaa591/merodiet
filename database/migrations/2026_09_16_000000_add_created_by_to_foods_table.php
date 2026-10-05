<?php
/**
 * Adds a nullable owner column to the foods table for the "custom
 * food" source (see FoodDataNormalizer/FoodCache docblocks — `source`
 * already anticipated a non-USDA source, this is the first one).
 *
 * USDA-sourced rows are shared cache, global to the site, and leave
 * this column NULL. A custom food is instead scoped to the
 * practitioner who entered it (same ownership model as clients,
 * recipes, and plans) — a branded product or homemade blend one
 * practitioner enters isn't necessarily correct or relevant for
 * another practitioner's clients.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

use MeroDiet\Database\Migration;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// phpcs:disable PluginCheck.Security.DirectDB.UnescapedDBParameter -- Table name comes from $wpdb->prefix plus a fixed name, never user input.

return new class() extends Migration {

	/**
	 * Add the created_by column, if not already present.
	 */
	public function up(): void {
		$table = $this->table( 'merodiet_foods' );

		$exists = $this->wpdb->get_var( $this->wpdb->prepare( 'SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = %s', DB_NAME, $table, 'created_by' ) ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- this IS $wpdb->prepare(), via the $this->wpdb property the Migration base class stores it under; WPCS's sniff only recognizes the bare global $wpdb variable form.

		if ( (int) $exists > 0 ) {
			return;
		}

		$this->wpdb->query( "ALTER TABLE {$table} ADD COLUMN created_by BIGINT UNSIGNED NULL AFTER source_id, ADD KEY created_by (created_by)" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input.
	}

	/**
	 * Drop the created_by column.
	 */
	public function down(): void {
		$table = $this->table( 'merodiet_foods' );
		$this->wpdb->query( "ALTER TABLE {$table} DROP COLUMN created_by" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input.
	}
};
