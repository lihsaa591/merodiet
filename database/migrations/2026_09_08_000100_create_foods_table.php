<?php
/**
 * Local cache of food data — currently sourced exclusively from USDA
 * FoodData Central.
 *
 * `source` + `source_id` (rather than a bare `fdc_id`) deliberately
 * doesn't hard-code USDA as the only possible data source: a client
 * outside the US eating country-specific packaged foods isn't well
 * served by USDA's Branded database, and a future second source (a
 * UK/EU food database, for example) would need its own ID space.
 * `source` is `'usda'` for now; adding a source means adding a new
 * normalizer that maps that source's own nutrient identifiers into the
 * same canonical per-100g shape FoodDataNormalizer produces — the rest
 * of the app only ever sees that canonical shape, never USDA's raw API
 * quirks. No such second source or translation layer exists yet; this
 * column split just avoids baking in "USDA forever" at the schema level
 * while it costs nothing to avoid.
 *
 * `nutrients` stores that already-normalized profile — see
 * FoodDataNormalizer — always per-100g, with the search/details
 * response-shape differences and the energy-field ambiguity (see that
 * class's docblock) already resolved. It is currently keyed by USDA's
 * own numeric nutrient IDs (1008 = energy, 1003 = protein, ...) — a
 * second source would need its own normalizer to translate into the
 * same ID space, which is real future work, not yet built.
 *
 * `source_synced_at` is separate from `updated_at`: the former tracks
 * when we last pulled from the source, the latter is the standard
 * row-touch timestamp (e.g. if a future admin tool lets a practitioner
 * manually correct an entry without re-syncing).
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
	 * Create the foods table.
	 */
	public function up(): void {
		$table           = $this->table( 'nutrio_foods' );
		$charset_collate = $this->wpdb->get_charset_collate();

		$this->delta(
			"CREATE TABLE {$table} (
				id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
				source VARCHAR(20) NOT NULL DEFAULT 'usda',
				source_id BIGINT UNSIGNED NOT NULL,
				description VARCHAR(500) NOT NULL,
				data_type VARCHAR(30) NOT NULL,
				nutrients LONGTEXT NOT NULL COMMENT 'JSON: normalized {nutrient_id: {name, unit, amount_per_100g}}',
				source_synced_at DATETIME NOT NULL,
				created_at DATETIME NOT NULL,
				updated_at DATETIME NOT NULL,
				PRIMARY KEY  (id),
				UNIQUE KEY source_food (source, source_id)
			) {$charset_collate};"
		);
	}

	/**
	 * Drop the foods table.
	 */
	public function down(): void {
		$table = $this->table( 'nutrio_foods' );
		$this->wpdb->query( "DROP TABLE IF EXISTS {$table}" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input.
	}
};
