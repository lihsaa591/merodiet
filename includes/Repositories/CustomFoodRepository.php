<?php
/**
 * Custom (hand-entered) food data access.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Repositories;

use Nutrio\Database\QueryFilters;
use Nutrio\Nutrition\CustomFoodNutrientMap;

/**
 * Custom foods live in the same `nutrio_foods` table as USDA-cached
 * foods (source = 'custom' instead of 'usda') — see
 * CustomFoodNutrientMap's docblock for why that keeps recipe/plan
 * nutrient totals working identically regardless of source. Unlike
 * USDA rows (global site cache, no owner), every custom food is scoped
 * to the practitioner who entered it via `created_by` — the same
 * ownership model as clients/recipes/plans.
 */
class CustomFoodRepository {

	/**
	 * Insert a new custom food, owned by the given practitioner.
	 *
	 * @param int                  $practitioner_user_id Owning practitioner's user ID.
	 * @param array<string, mixed> $data                  ['name' => string] plus any CustomFoodNutrientMap::field_keys().
	 *
	 * @return int The new food's internal ID.
	 */
	public function create( int $practitioner_user_id, array $data ): int {
		global $wpdb;

		$now = current_time( 'mysql' );

		$wpdb->insert(
			$wpdb->prefix . 'nutrio_foods',
			array(
				'source'           => 'custom',
				// Custom rows have no external source ID to key on — the
				// internal id fills that role once known, so this starts
				// at 0 and is corrected to the row's own id right after insert.
				'source_id'        => 0,
				'created_by'       => $practitioner_user_id,
				'description'      => $data['name'],
				'data_type'        => 'Custom',
				'nutrients'        => wp_json_encode( CustomFoodNutrientMap::to_nutrients( $data ) ),
				'source_synced_at' => $now,
				'created_at'       => $now,
				'updated_at'       => $now,
			)
		);

		$id = (int) $wpdb->insert_id;

		$wpdb->update( $wpdb->prefix . 'nutrio_foods', array( 'source_id' => $id ), array( 'id' => $id ) );

		return $id;
	}

	/**
	 * Find a custom food by ID, scoped to the given practitioner.
	 *
	 * @param int $id                    Internal food ID.
	 * @param int $practitioner_user_id  Practitioner the food must belong to.
	 *
	 * @return array<string, mixed>|null
	 */
	public function find_for_practitioner( int $id, int $practitioner_user_id ): ?array {
		global $wpdb;

		$row = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$wpdb->prefix}nutrio_foods WHERE id = %d AND source = 'custom' AND created_by = %d", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input; values are parameterized.
				$id,
				$practitioner_user_id
			),
			ARRAY_A
		);

		return null === $row ? null : $this->hydrate( $row );
	}

	/**
	 * A page of a practitioner's own custom foods, alphabetical by name,
	 * plus the total count across all pages. $filters is deliberately
	 * open-ended — see QueryFilters — today supports 'search' (name); a
	 * future filter is one more QueryFilters call here, not a signature
	 * change.
	 *
	 * @param int                   $practitioner_user_id Owning practitioner's user ID.
	 * @param int                   $page                 1-indexed page number.
	 * @param int                   $per_page             Rows per page.
	 * @param array<string, string> $filters              Optional filters — 'search'.
	 *
	 * @return array{items: array<int, array<string, mixed>>, total: int}
	 */
	public function all_for_practitioner( int $practitioner_user_id, int $page = 1, int $per_page = 10, array $filters = array() ): array {
		global $wpdb;

		$table = $wpdb->prefix . 'nutrio_foods';

		$params = array( $practitioner_user_id );

		$where = QueryFilters::combine(
			"source = 'custom' AND created_by = %d",
			array(
				QueryFilters::search_clause( $filters, 'search', array( 'description' ), $params ),
			)
		);

		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders -- table name and WHERE clause are built from fixed strings and caller-supplied literals, not user input; every value is bound via prepare()'s own placeholders. phpcs's static count of "%s"/"%d" tokens can't see through the ...$params spread.
		$total = (int) $wpdb->get_var(
			$wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE {$where}", ...$params )
		);

		$offset = max( 0, ( $page - 1 ) * $per_page );

		$found = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE {$where} ORDER BY description LIMIT %d OFFSET %d",
				...array_merge( $params, array( $per_page, $offset ) )
			),
			ARRAY_A
		);
		// phpcs:enable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders

		$rows = null === $found ? array() : $found;

		return array(
			'items' => array_map( array( $this, 'hydrate' ), $rows ),
			'total' => $total,
		);
	}

	/**
	 * Update a custom food's own fields — only keys present in $data are
	 * touched; 'name' updates description, any nutrient field key
	 * rewrites the whole nutrients map (since it's stored as one JSON blob).
	 *
	 * @param int                  $id   Internal food ID.
	 * @param array<string, mixed> $data Fields to update.
	 */
	public function update( int $id, array $data ): bool {
		global $wpdb;

		$fields = array();

		if ( array_key_exists( 'name', $data ) ) {
			$fields['description'] = $data['name'];
		}

		if ( array_intersect_key( array_flip( CustomFoodNutrientMap::field_keys() ), $data ) !== array() ) {
			$fields['nutrients'] = wp_json_encode( CustomFoodNutrientMap::to_nutrients( $data ) );
		}

		if ( array() === $fields ) {
			return true; // Nothing to update isn't an error.
		}

		$fields['updated_at'] = current_time( 'mysql' );

		$updated = $wpdb->update( $wpdb->prefix . 'nutrio_foods', $fields, array( 'id' => $id ) );

		return false !== $updated;
	}

	/**
	 * Whether any recipe currently uses this food as an ingredient —
	 * callers use this to block deleting a custom food still in use,
	 * the same way an assigned plan blocks edits.
	 *
	 * @param int $food_id Internal food ID.
	 */
	public function is_used_in_a_recipe( int $food_id ): bool {
		global $wpdb;

		$count = $wpdb->get_var(
			$wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}nutrio_recipe_items WHERE food_id = %d", $food_id ) // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input; value is parameterized.
		);

		return (int) $count > 0;
	}

	/**
	 * Delete a custom food by internal ID.
	 *
	 * @param int $id Internal food ID.
	 */
	public function delete( int $id ): bool {
		global $wpdb;

		return false !== $wpdb->delete( $wpdb->prefix . 'nutrio_foods', array( 'id' => $id ) );
	}

	/**
	 * Convert a raw database row into typed, decoded fields — flattened
	 * to the request-field shape for the edit form (see
	 * CustomFoodNutrientMap::to_fields()), plus the raw nutrient-ID-keyed
	 * `nutrients` map so a custom food can be used anywhere a
	 * ResolvedFood is expected (e.g. added straight to a recipe from
	 * FoodSearch's "My custom foods" tab) without the frontend having to
	 * duplicate CustomFoodNutrientMap's ID mapping.
	 *
	 * @param array<string, mixed> $row Raw database row.
	 *
	 * @return array<string, mixed>
	 */
	private function hydrate( array $row ): array {
		$nutrients = (array) json_decode( (string) $row['nutrients'], true );

		return array_merge(
			array(
				'id'         => (int) $row['id'],
				'created_by' => (int) $row['created_by'],
				'name'       => (string) $row['description'],
				'nutrients'  => $nutrients,
				'updated_at' => (string) $row['updated_at'],
			),
			CustomFoodNutrientMap::to_fields( $nutrients )
		);
	}
}
