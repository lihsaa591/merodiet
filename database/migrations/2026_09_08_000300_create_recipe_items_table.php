<?php
/**
 * Line items within a recipe.
 *
 * `quantity_grams` is the canonical unit throughout Nutrio's schema —
 * every quantity, everywhere, is stored in grams. A future UI can offer
 * "1 cup" / "2 tbsp" entry, but it converts to grams before storage so
 * the nutrient engine only ever has one unit to reason about.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

use Nutrio\Database\Migration;

return new class() extends Migration {

	/**
	 * Create the recipe_items table.
	 */
	public function up(): void {
		$table           = $this->table( 'nutrio_recipe_items' );
		$charset_collate = $this->wpdb->get_charset_collate();

		// food_id references nutrio_foods.id — dbDelta() cannot create
		// foreign keys, and WordPress convention doesn't rely on them;
		// referential integrity is enforced in application code.
		$this->delta(
			"CREATE TABLE {$table} (
				id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
				recipe_id BIGINT UNSIGNED NOT NULL,
				food_id BIGINT UNSIGNED NOT NULL,
				quantity_grams DECIMAL(10,2) NOT NULL,
				sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
				created_at DATETIME NOT NULL,
				PRIMARY KEY  (id),
				KEY recipe_id (recipe_id),
				KEY food_id (food_id)
			) {$charset_collate};"
		);
	}

	/**
	 * Drop the recipe_items table.
	 */
	public function down(): void {
		$table = $this->table( 'nutrio_recipe_items' );
		$this->wpdb->query( "DROP TABLE IF EXISTS {$table}" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input.
	}
};
