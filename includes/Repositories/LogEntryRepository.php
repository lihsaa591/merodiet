<?php
/**
 * Client compliance-log data access.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, PluginCheck.Security.DirectDB.UnescapedDBParameter -- Plugin's own custom tables; table names come from $wpdb->prefix and every value is bound via $wpdb->prepare().

namespace MeroDiet\Repositories;

use MeroDiet\Database\QueryFilters;
use WP_Error;

/**
 * Every read/write method here takes the client's own internal ID —
 * scoping happens one layer up, in AbstractClientController::
 * current_client_id(), which resolves it from the logged-in WP user
 * and never trusts a client_id supplied in the request itself. See
 * ClientRepository's docblock for the same defense-in-depth reasoning
 * applied to practitioner-owned rows.
 */
class LogEntryRepository {

	/**
	 * Insert one log entry for a client.
	 *
	 * @param int                                                                                                                                                           $client_id Owning client's internal ID.
	 * @param array{plan_item_id?:int, food_id?:int, recipe_id?:int, quantity_grams?:float, servings?:float, log_date:string, status:string, source?:string, notes?:string} $data      Entry fields.
	 *
	 * @return int|WP_Error The new entry's internal ID, or a WP_Error if the insert failed.
	 */
	public function create_for_client( int $client_id, array $data ): int|WP_Error {
		global $wpdb;

		$inserted = $wpdb->insert(
			$wpdb->prefix . 'merodiet_log_entries',
			array(
				'client_id'      => $client_id,
				'plan_item_id'   => $data['plan_item_id'] ?? null,
				'food_id'        => $data['food_id'] ?? null,
				'recipe_id'      => $data['recipe_id'] ?? null,
				'quantity_grams' => $data['quantity_grams'] ?? null,
				'servings'       => $data['servings'] ?? null,
				'log_date'       => $data['log_date'],
				'status'         => $data['status'],
				'source'         => $data['source'] ?? 'manual',
				'notes'          => $data['notes'] ?? null,
				'created_at'     => current_time( 'mysql' ),
			)
		);

		if ( false === $inserted ) {
			return new WP_Error( 'merodiet_db_error', __( 'Could not save the entry.', 'merodiet' ), array( 'status' => 500 ) );
		}

		$id = (int) $wpdb->insert_id;

		// Fires after a client logs a compliance entry.
		do_action( 'merodiet_log_entry_created', $id, $data, $client_id );

		return $id;
	}

	/**
	 * A client's log entries, most recent first, optionally windowed by
	 * date. $filters supports 'from'/'to' (inclusive, either optional).
	 *
	 * @param int                   $client_id Owning client's internal ID.
	 * @param array<string, string> $filters   Optional filters — 'from', 'to'.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public function all_for_client( int $client_id, array $filters = array() ): array {
		global $wpdb;

		$table  = $wpdb->prefix . 'merodiet_log_entries';
		$params = array( $client_id );

		$where = QueryFilters::combine(
			'client_id = %d',
			array(
				QueryFilters::date_range_clause( $filters, 'from', 'to', 'log_date', $params ),
			)
		);

		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders -- table name and WHERE clause are built from fixed strings and caller-supplied literals, not user input; every value is bound via prepare()'s own placeholders. phpcs's static count of "%s"/"%d" tokens can't see through the ...$params spread, hence the placeholder-count warnings below.
		$found = $wpdb->get_results(
			$wpdb->prepare( "SELECT * FROM {$table} WHERE {$where} ORDER BY log_date DESC, id DESC", ...$params ),
			ARRAY_A
		);
		// phpcs:enable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders

		$rows = null === $found ? array() : $found;

		return array_map( array( $this, 'hydrate' ), $rows );
	}

	/**
	 * Find a log entry by ID, regardless of owner — callers must verify
	 * ownership (compare the returned row's client_id) before exposing
	 * or mutating it.
	 *
	 * @param int $id Internal entry ID.
	 *
	 * @return array<string, mixed>|null
	 */
	public function find( int $id ): ?array {
		global $wpdb;

		$row = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}merodiet_log_entries WHERE id = %d", $id ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input; value is parameterized.
			ARRAY_A
		);

		return null === $row ? null : $this->hydrate( $row );
	}

	/**
	 * Convert a raw database row into typed, decoded fields.
	 *
	 * @param array<string, mixed> $row Raw database row.
	 *
	 * @return array<string, mixed>
	 */
	private function hydrate( array $row ): array {
		$row['id']             = (int) $row['id'];
		$row['client_id']      = (int) $row['client_id'];
		$row['plan_item_id']   = null === $row['plan_item_id'] ? null : (int) $row['plan_item_id'];
		$row['food_id']        = null === $row['food_id'] ? null : (int) $row['food_id'];
		$row['recipe_id']      = null === $row['recipe_id'] ? null : (int) $row['recipe_id'];
		$row['quantity_grams'] = null === $row['quantity_grams'] ? null : (float) $row['quantity_grams'];
		$row['servings']       = null === $row['servings'] ? null : (float) $row['servings'];

		return $row;
	}
}
