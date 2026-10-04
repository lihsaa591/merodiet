<?php
/**
 * Meal plans.
 *
 * A plan is a draft (freely editable, totals always computed live from
 * current food data) until it is assigned to a client, at which point
 * `assigned_at` is set and `nutrient_snapshot` is populated — see
 * NutrientCalculator's docblock for why: an assigned plan must go on
 * rendering the values the practitioner actually reviewed and the
 * client actually received, even if the underlying USDA cache is later
 * corrected. Correcting food data should improve *future* plans, not
 * silently rewrite ones already handed to a client.
 *
 * `client_id` is nullable so a plan can exist as a draft/template
 * before being assigned to anyone.
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
	 * Create the plans table.
	 */
	public function up(): void {
		$table           = $this->table( 'nutrio_plans' );
		$charset_collate = $this->wpdb->get_charset_collate();

		$this->delta(
			"CREATE TABLE {$table} (
				id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
				practitioner_user_id BIGINT UNSIGNED NOT NULL,
				client_id BIGINT UNSIGNED NULL,
				title VARCHAR(191) NOT NULL,
				status VARCHAR(20) NOT NULL DEFAULT 'draft',
				start_date DATE NOT NULL,
				end_date DATE NOT NULL,
				assigned_at DATETIME NULL,
				nutrient_snapshot LONGTEXT NULL COMMENT 'JSON: {day_offset: {nutrient_id: total_amount}}, populated on assignment',
				created_at DATETIME NOT NULL,
				updated_at DATETIME NOT NULL,
				PRIMARY KEY  (id),
				KEY practitioner_user_id (practitioner_user_id),
				KEY client_id (client_id)
			) {$charset_collate};"
		);
	}

	/**
	 * Drop the plans table.
	 */
	public function down(): void {
		$table = $this->table( 'nutrio_plans' );
		$this->wpdb->query( "DROP TABLE IF EXISTS {$table}" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input.
	}
};
