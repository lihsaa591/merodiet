<?php
/**
 * Client body measurements over time.
 *
 * `weight_grams` is the one measurement common enough to earn its own
 * column, stored as an integer (grams) rather than a float in kg/lbs —
 * consistent with the project-wide rule of never using floats for a
 * value that gets arithmetic done on it. Display-unit conversion
 * (kg/lbs) is a UI concern, not a storage concern.
 *
 * `metrics` is an open JSON bag for anything else (waist circumference,
 * body fat %, blood pressure, ...) — deliberately not a rigid column
 * per metric type, since which metrics a practitioner tracks varies
 * and shouldn't require a migration to add.
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
	 * Create the measurements table.
	 */
	public function up(): void {
		$table           = $this->table( 'merodiet_measurements' );
		$charset_collate = $this->wpdb->get_charset_collate();

		$this->delta(
			"CREATE TABLE {$table} (
				id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
				client_id BIGINT UNSIGNED NOT NULL,
				measured_at DATE NOT NULL,
				weight_grams INT UNSIGNED NULL,
				metrics TEXT NULL COMMENT 'JSON: {waist_cm, body_fat_pct, ...}, freeform',
				notes TEXT NULL,
				created_at DATETIME NOT NULL,
				PRIMARY KEY  (id),
				KEY client_id (client_id),
				KEY measured_at (measured_at)
			) {$charset_collate};"
		);
	}

	/**
	 * Drop the measurements table.
	 */
	public function down(): void {
		$table = $this->table( 'merodiet_measurements' );
		$this->wpdb->query( "DROP TABLE IF EXISTS {$table}" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input.
	}
};
