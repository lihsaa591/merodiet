<?php
/**
 * Days within a plan.
 *
 * `day_offset` is relative (0-indexed from the plan's start_date), not
 * an absolute date — this lets a plan be authored as a template before
 * it has a concrete start_date pinned down. Resolve the actual calendar
 * date as `plan.start_date + day_offset days`.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

use Nutrio\Database\Migration;

return new class() extends Migration {

	/**
	 * Create the plan_days table.
	 */
	public function up(): void {
		$table           = $this->table( 'nutrio_plan_days' );
		$charset_collate = $this->wpdb->get_charset_collate();

		$this->delta(
			"CREATE TABLE {$table} (
				id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
				plan_id BIGINT UNSIGNED NOT NULL,
				day_offset SMALLINT UNSIGNED NOT NULL,
				created_at DATETIME NOT NULL,
				PRIMARY KEY  (id),
				UNIQUE KEY plan_day (plan_id, day_offset)
			) {$charset_collate};"
		);
	}

	/**
	 * Drop the plan_days table.
	 */
	public function down(): void {
		$table = $this->table( 'nutrio_plan_days' );
		$this->wpdb->query( "DROP TABLE IF EXISTS {$table}" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input.
	}
};
