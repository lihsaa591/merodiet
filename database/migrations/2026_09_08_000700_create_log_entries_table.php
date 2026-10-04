<?php
/**
 * A client's compliance log: what they actually ate.
 *
 * `plan_item_id` links back to what was planned, if this entry is
 * fulfilling a planned item ("mark eaten" or "log substitution").
 * `food_id`/`recipe_id` + quantity describe what was *actually*
 * consumed — for a straight "mark eaten" this matches the plan item's
 * own food/recipe and quantity; for a substitution or an ad-hoc entry
 * (not tied to any plan_item) it's whatever the client actually logged.
 *
 * Unlike plans, log entries are never snapshotted — they describe a
 * real, live event, and computing their nutrient totals from the
 * current food cache is correct (that IS what was eaten, described as
 * accurately as current data allows).
 *
 * `source` distinguishes manual entry from AI-assisted natural-language
 * parsing (Phase 5) — see NutrientCalculator and the AI parsing layer's
 * docblocks: AI only ever identifies *what* was logged, never *how much
 * energy* it is; that distinction is exactly why this column exists,
 * so a practitioner can always audit which entries came from a click
 * versus AI-parsed text.
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
	 * Create the log_entries table.
	 */
	public function up(): void {
		$table           = $this->table( 'nutrio_log_entries' );
		$charset_collate = $this->wpdb->get_charset_collate();

		$this->delta(
			"CREATE TABLE {$table} (
				id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
				client_id BIGINT UNSIGNED NOT NULL,
				plan_item_id BIGINT UNSIGNED NULL,
				food_id BIGINT UNSIGNED NULL,
				recipe_id BIGINT UNSIGNED NULL,
				quantity_grams DECIMAL(10,2) NULL,
				servings DECIMAL(6,2) NULL,
				log_date DATE NOT NULL,
				status VARCHAR(20) NOT NULL COMMENT 'eaten|substituted|skipped',
				source VARCHAR(20) NOT NULL DEFAULT 'manual' COMMENT 'manual|ai_parsed',
				notes TEXT NULL,
				created_at DATETIME NOT NULL,
				PRIMARY KEY  (id),
				KEY client_id (client_id),
				KEY plan_item_id (plan_item_id),
				KEY log_date (log_date)
			) {$charset_collate};"
		);
	}

	/**
	 * Drop the log_entries table.
	 */
	public function down(): void {
		$table = $this->table( 'nutrio_log_entries' );
		$this->wpdb->query( "DROP TABLE IF EXISTS {$table}" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input.
	}
};
