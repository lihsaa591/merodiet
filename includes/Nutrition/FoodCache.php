<?php
/**
 * Local food-data cache reads/writes.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, PluginCheck.Security.DirectDB.UnescapedDBParameter -- Plugin's own custom tables; table names come from $wpdb->prefix and every value is bound via $wpdb->prepare().

namespace Nutrio\Nutrition;

/**
 * The nutrio_foods table is the only place the rest of the app reads
 * nutrient data from — nothing outside FoodDataService talks to
 * FoodDataClient directly. This keeps "where does nutrient data come
 * from" a single, swappable decision (see the source/source_id design
 * note on the foods migration).
 */
class FoodCache {

	/**
	 * Insert or update a food's cached record, keyed by (source, source_id).
	 *
	 * @param array{source:string, source_id:int, description:string, data_type:string, nutrients:array<int, array{name:string, unit:string, amount_per_100g:float}>} $food Normalized food data — see FoodDataNormalizer::normalize().
	 *
	 * @return int The internal foods.id (inserted or updated).
	 */
	public function store( array $food ): int {
		global $wpdb;

		$table = $wpdb->prefix . 'nutrio_foods';
		$now   = current_time( 'mysql' );

		$existing_id = $this->find_internal_id( $food['source'], $food['source_id'] );

		$data = array(
			'source'           => $food['source'],
			'source_id'        => $food['source_id'],
			'description'      => $food['description'],
			'data_type'        => $food['data_type'],
			'nutrients'        => wp_json_encode( $food['nutrients'] ),
			'source_synced_at' => $now,
			'updated_at'       => $now,
		);

		if ( null !== $existing_id ) {
			$wpdb->update( $table, $data, array( 'id' => $existing_id ) );
			return $existing_id;
		}

		$data['created_at'] = $now;
		$wpdb->insert( $table, $data );

		return (int) $wpdb->insert_id;
	}

	/**
	 * Look up a cached food by its source and source-native ID.
	 *
	 * @param string $source    e.g. "usda".
	 * @param int    $source_id ID within that source, e.g. a USDA fdcId.
	 */
	public function find_by_source( string $source, int $source_id ): ?array {
		global $wpdb;

		$table = $wpdb->prefix . 'nutrio_foods';

		$row = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE source = %s AND source_id = %d", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input; values are parameterized.
				$source,
				$source_id
			),
			ARRAY_A
		);

		return null === $row ? null : $this->hydrate( $row );
	}

	/**
	 * Look up a cached food by its internal ID.
	 *
	 * @param int $id Internal foods.id.
	 */
	public function find( int $id ): ?array {
		global $wpdb;

		$table = $wpdb->prefix . 'nutrio_foods';

		$row = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input; value is parameterized.
			ARRAY_A
		);

		return null === $row ? null : $this->hydrate( $row );
	}

	/**
	 * Resolve the internal foods.id for a (source, source_id) pair, if cached.
	 *
	 * @param string $source    e.g. "usda".
	 * @param int    $source_id ID within that source, e.g. a USDA fdcId.
	 */
	private function find_internal_id( string $source, int $source_id ): ?int {
		global $wpdb;

		$table = $wpdb->prefix . 'nutrio_foods';

		$id = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT id FROM {$table} WHERE source = %s AND source_id = %d", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input; values are parameterized.
				$source,
				$source_id
			)
		);

		return null === $id ? null : (int) $id;
	}

	/**
	 * Convert a raw database row into the normalized food shape.
	 *
	 * @param array<string, mixed> $row Raw database row.
	 *
	 * @return array{id:int, source:string, source_id:int, description:string, data_type:string, nutrients:array<int, array{name:string, unit:string, amount_per_100g:float}>}
	 */
	private function hydrate( array $row ): array {
		return array(
			'id'          => (int) $row['id'],
			'source'      => (string) $row['source'],
			'source_id'   => (int) $row['source_id'],
			'description' => (string) $row['description'],
			'data_type'   => (string) $row['data_type'],
			'nutrients'   => (array) json_decode( (string) $row['nutrients'], true ),
		);
	}
}
