<?php
/**
 * Practitioner-owned reusable recipes.
 *
 * `servings` is the denominator recipe_items' totals get divided by to
 * produce a per-serving nutrient profile — see NutrientCalculator.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

use Nutrio\Database\Migration;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// phpcs:disable PluginCheck.Security.DirectDB.UnescapedDBParameter -- Table name comes from $wpdb->prefix plus a fixed name, never user input.

return new class() extends Migration {

	/**
	 * Create the recipes table.
	 */
	public function up(): void {
		$table           = $this->table( 'nutrio_recipes' );
		$charset_collate = $this->wpdb->get_charset_collate();

		$this->delta(
			"CREATE TABLE {$table} (
				id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
				practitioner_user_id BIGINT UNSIGNED NOT NULL,
				name VARCHAR(191) NOT NULL,
				description TEXT NULL,
				servings SMALLINT UNSIGNED NOT NULL DEFAULT 1,
				created_at DATETIME NOT NULL,
				updated_at DATETIME NOT NULL,
				PRIMARY KEY  (id),
				KEY practitioner_user_id (practitioner_user_id)
			) {$charset_collate};"
		);
	}

	/**
	 * Drop the recipes table.
	 */
	public function down(): void {
		$table = $this->table( 'nutrio_recipes' );
		$this->wpdb->query( "DROP TABLE IF EXISTS {$table}" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input.
	}
};
