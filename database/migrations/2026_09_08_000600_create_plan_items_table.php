<?php
/**
 * Food or recipe items scheduled within a plan day.
 *
 * Exactly one of food_id / recipe_id is set per row (application-level
 * invariant, not a DB constraint — dbDelta() has no CHECK support).
 * Correspondingly exactly one of quantity_grams (direct food) /
 * servings (recipe, scaling its per-serving nutrient profile) is set.
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
	 * Create the plan_items table.
	 */
	public function up(): void {
		$table           = $this->table( 'merodiet_plan_items' );
		$charset_collate = $this->wpdb->get_charset_collate();

		$this->delta(
			"CREATE TABLE {$table} (
				id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
				plan_day_id BIGINT UNSIGNED NOT NULL,
				meal_type VARCHAR(20) NOT NULL COMMENT 'breakfast|lunch|dinner|snack',
				food_id BIGINT UNSIGNED NULL,
				recipe_id BIGINT UNSIGNED NULL,
				quantity_grams DECIMAL(10,2) NULL,
				servings DECIMAL(6,2) NULL,
				sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
				created_at DATETIME NOT NULL,
				PRIMARY KEY  (id),
				KEY plan_day_id (plan_day_id),
				KEY food_id (food_id),
				KEY recipe_id (recipe_id)
			) {$charset_collate};"
		);
	}

	/**
	 * Drop the plan_items table.
	 */
	public function down(): void {
		$table = $this->table( 'merodiet_plan_items' );
		$this->wpdb->query( "DROP TABLE IF EXISTS {$table}" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input.
	}
};
