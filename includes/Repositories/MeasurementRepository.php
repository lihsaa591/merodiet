<?php
/**
 * Client body-measurement data access.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Repositories;

use Nutrio\Database\QueryFilters;
use WP_Error;

/**
 * Same client-scoping posture as LogEntryRepository — every method
 * takes the client's own internal ID, resolved one layer up by
 * AbstractClientController, never a caller-supplied one.
 */
class MeasurementRepository {

	/**
	 * Insert one measurement for a client.
	 *
	 * @param int                                                                                        $client_id Owning client's internal ID.
	 * @param array{measured_at:string, weight_grams?:int, metrics?:array<string, mixed>, notes?:string} $data      Measurement fields.
	 *
	 * @return int|WP_Error The new measurement's internal ID, or a WP_Error if the insert failed.
	 */
	public function create_for_client( int $client_id, array $data ): int|WP_Error {
		global $wpdb;

		$inserted = $wpdb->insert(
			$wpdb->prefix . 'nutrio_measurements',
			array(
				'client_id'    => $client_id,
				'measured_at'  => $data['measured_at'],
				'weight_grams' => $data['weight_grams'] ?? null,
				'metrics'      => wp_json_encode( $data['metrics'] ?? array() ),
				'notes'        => $data['notes'] ?? null,
				'created_at'   => current_time( 'mysql' ),
			)
		);

		if ( false === $inserted ) {
			return new WP_Error( 'nutrio_db_error', __( 'Could not save the entry.', 'nutrio' ), array( 'status' => 500 ) );
		}

		$id = (int) $wpdb->insert_id;

		// Fires after a client logs a measurement.
		do_action( 'nutrio_measurement_created', $id, $data, $client_id );

		return $id;
	}

	/**
	 * A client's measurements, most recent first, optionally windowed
	 * by date. $filters supports 'from'/'to' (inclusive, either optional).
	 *
	 * @param int                   $client_id Owning client's internal ID.
	 * @param array<string, string> $filters   Optional filters — 'from', 'to'.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public function all_for_client( int $client_id, array $filters = array() ): array {
		global $wpdb;

		$table  = $wpdb->prefix . 'nutrio_measurements';
		$params = array( $client_id );

		$where = QueryFilters::combine(
			'client_id = %d',
			array(
				QueryFilters::date_range_clause( $filters, 'from', 'to', 'measured_at', $params ),
			)
		);

		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders -- table name and WHERE clause are built from fixed strings and caller-supplied literals, not user input; every value is bound via prepare()'s own placeholders. phpcs's static count of "%s"/"%d" tokens can't see through the ...$params spread, hence the placeholder-count warnings below.
		$found = $wpdb->get_results(
			$wpdb->prepare( "SELECT * FROM {$table} WHERE {$where} ORDER BY measured_at DESC, id DESC", ...$params ),
			ARRAY_A
		);
		// phpcs:enable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders

		$rows = null === $found ? array() : $found;

		return array_map( array( $this, 'hydrate' ), $rows );
	}

	/**
	 * Find a measurement by ID, regardless of owner — callers must
	 * verify ownership (compare the returned row's client_id) before
	 * exposing or mutating it.
	 *
	 * @param int $id Internal measurement ID.
	 *
	 * @return array<string, mixed>|null
	 */
	public function find( int $id ): ?array {
		global $wpdb;

		$row = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}nutrio_measurements WHERE id = %d", $id ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input; value is parameterized.
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
		$row['id']           = (int) $row['id'];
		$row['client_id']    = (int) $row['client_id'];
		$row['weight_grams'] = null === $row['weight_grams'] ? null : (int) $row['weight_grams'];
		$row['metrics']      = (array) json_decode( (string) $row['metrics'], true );

		return $row;
	}
}
