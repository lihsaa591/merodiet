<?php
/**
 * Client roster.
 *
 * A client always belongs to exactly one practitioner (enforced by
 * practitioner_user_id being required, not by a join table) — this
 * product is single-practitioner in v1; see non-goals.
 *
 * `user_id` is nullable: a practitioner can create a client record
 * (to start building plans) before the client has portal login access
 * (Phase 3). Allergies are stored as a JSON array of free-text strings
 * for v1 — good enough for a human practitioner to read, and Phase 5's
 * allergy validator can do case-insensitive substring matching against
 * it without needing a normalized allergen table yet.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

use Nutrio\Database\Migration;

return new class() extends Migration {

	/**
	 * Create the clients table.
	 */
	public function up(): void {
		$table           = $this->table( 'nutrio_clients' );
		$charset_collate = $this->wpdb->get_charset_collate();

		$this->delta(
			"CREATE TABLE {$table} (
				id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
				practitioner_user_id BIGINT UNSIGNED NOT NULL,
				user_id BIGINT UNSIGNED NULL,
				first_name VARCHAR(100) NOT NULL,
				last_name VARCHAR(100) NOT NULL,
				email VARCHAR(191) NOT NULL,
				goals TEXT NULL,
				dietary_restrictions TEXT NULL,
				allergies TEXT NULL COMMENT 'JSON array of free-text allergen strings',
				status VARCHAR(20) NOT NULL DEFAULT 'active',
				created_at DATETIME NOT NULL,
				updated_at DATETIME NOT NULL,
				PRIMARY KEY  (id),
				KEY practitioner_user_id (practitioner_user_id),
				KEY user_id (user_id)
			) {$charset_collate};"
		);
	}

	/**
	 * Drop the clients table.
	 */
	public function down(): void {
		$table = $this->table( 'nutrio_clients' );
		$this->wpdb->query( "DROP TABLE IF EXISTS {$table}" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input.
	}
};
