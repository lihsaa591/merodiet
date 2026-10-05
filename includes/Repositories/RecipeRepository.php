<?php
/**
 * Recipe data access.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, PluginCheck.Security.DirectDB.UnescapedDBParameter -- Plugin's own custom tables; table names come from $wpdb->prefix and every value is bound via $wpdb->prepare().

namespace MeroDiet\Repositories;

use MeroDiet\Database\QueryFilters;

/**
 * A recipe's items are replaced wholesale on update (delete-all then
 * re-insert) rather than diffed — simpler, and recipes are small
 * enough (a handful of ingredients) that this is not a performance
 * concern. There is no foreign key from recipe_items to recipes
 * (dbDelta() can't create one), so this class is also what enforces
 * "deleting a recipe deletes its items" — that invariant lives here,
 * not in the database.
 */
class RecipeRepository {

	/**
	 * Insert a new recipe and its items, owned by the given practitioner.
	 *
	 * @param int                                                                                                                $practitioner_user_id Owning practitioner's user ID.
	 * @param array{name:string, description?:string, servings?:int, items:array<int, array{food_id:int, quantity_grams:float}>} $data                  Recipe fields, including its ingredient items.
	 *
	 * @return int The new recipe's internal ID.
	 */
	public function create( int $practitioner_user_id, array $data ): int {
		global $wpdb;

		$now = current_time( 'mysql' );

		$wpdb->insert(
			$wpdb->prefix . 'merodiet_recipes',
			array(
				'practitioner_user_id' => $practitioner_user_id,
				'name'                 => $data['name'],
				'description'          => $data['description'] ?? null,
				'servings'             => $data['servings'] ?? 1,
				'created_at'           => $now,
				'updated_at'           => $now,
			)
		);

		$recipe_id = (int) $wpdb->insert_id;

		$this->replace_items( $recipe_id, $data['items'] );

		return $recipe_id;
	}

	/**
	 * Find a recipe by ID, regardless of owner — see
	 * ClientRepository::find()'s docblock for the same caveat: callers
	 * must verify ownership themselves.
	 *
	 * @param int $id Internal recipe ID.
	 *
	 * @return array<string, mixed>|null
	 */
	public function find( int $id ): ?array {
		global $wpdb;

		$row = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}merodiet_recipes WHERE id = %d", $id ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input; value is parameterized.
			ARRAY_A
		);

		return null === $row ? null : $this->hydrate( $row );
	}

	/**
	 * Find a recipe by ID, scoped to the given practitioner.
	 *
	 * @param int $id                   Internal recipe ID.
	 * @param int $practitioner_user_id Practitioner the recipe must belong to.
	 *
	 * @return array<string, mixed>|null
	 */
	public function find_for_practitioner( int $id, int $practitioner_user_id ): ?array {
		global $wpdb;

		$row = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$wpdb->prefix}merodiet_recipes WHERE id = %d AND practitioner_user_id = %d", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input; values are parameterized.
				$id,
				$practitioner_user_id
			),
			ARRAY_A
		);

		return null === $row ? null : $this->hydrate( $row );
	}

	/**
	 * A page of recipes belonging to a practitioner, alphabetical by name,
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

		$table = $wpdb->prefix . 'merodiet_recipes';

		$params = array( $practitioner_user_id );

		$where = QueryFilters::combine(
			'practitioner_user_id = %d',
			array(
				QueryFilters::search_clause( $filters, 'search', array( 'name' ), $params ),
			)
		);

		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders -- table name and WHERE clause are built from fixed strings and caller-supplied literals, not user input; every value is bound via prepare()'s own placeholders. phpcs's static count of "%s"/"%d" tokens can't see through the ...$params spread.
		$total = (int) $wpdb->get_var(
			$wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE {$where}", ...$params )
		);

		$offset = max( 0, ( $page - 1 ) * $per_page );

		$found = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE {$where} ORDER BY name LIMIT %d OFFSET %d",
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
	 * A recipe's ingredient rows, in their stored order.
	 *
	 * @param int $recipe_id Internal recipe ID.
	 *
	 * @return array<int, array{id:int, food_id:int, quantity_grams:float}>
	 */
	public function items_for_recipe( int $recipe_id ): array {
		global $wpdb;

		$found = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$wpdb->prefix}merodiet_recipe_items WHERE recipe_id = %d ORDER BY sort_order", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input; value is parameterized.
				$recipe_id
			),
			ARRAY_A
		);

		$rows = null === $found ? array() : $found;

		return array_map(
			static fn ( array $row ) => array(
				'id'             => (int) $row['id'],
				'food_id'        => (int) $row['food_id'],
				'quantity_grams' => (float) $row['quantity_grams'],
			),
			$rows
		);
	}

	/**
	 * Delete every existing item for a recipe and insert the given set
	 * in its place — see class docblock for why this is wholesale, not diffed.
	 *
	 * @param int                                                  $recipe_id Internal recipe ID.
	 * @param array<int, array{food_id:int, quantity_grams:float}> $items     Ingredient rows to store, in order.
	 */
	public function replace_items( int $recipe_id, array $items ): void {
		global $wpdb;

		$wpdb->delete( $wpdb->prefix . 'merodiet_recipe_items', array( 'recipe_id' => $recipe_id ) );

		$now = current_time( 'mysql' );

		foreach ( array_values( $items ) as $sort_order => $item ) {
			$wpdb->insert(
				$wpdb->prefix . 'merodiet_recipe_items',
				array(
					'recipe_id'      => $recipe_id,
					'food_id'        => $item['food_id'],
					'quantity_grams' => $item['quantity_grams'],
					'sort_order'     => $sort_order,
					'created_at'     => $now,
				)
			);
		}
	}

	/**
	 * Update a recipe's own fields — only keys present in $data are
	 * touched. Pass 'items' to also replace the recipe's ingredients.
	 *
	 * @param int                  $id   Internal recipe ID.
	 * @param array<string, mixed> $data Fields to update.
	 */
	public function update( int $id, array $data ): bool {
		global $wpdb;

		$fields = array();

		foreach ( array( 'name', 'description', 'servings' ) as $field ) {
			if ( array_key_exists( $field, $data ) ) {
				$fields[ $field ] = $data[ $field ];
			}
		}

		if ( array_key_exists( 'items', $data ) ) {
			$this->replace_items( $id, $data['items'] );
		}

		if ( array() === $fields ) {
			return true;
		}

		$fields['updated_at'] = current_time( 'mysql' );

		$updated = $wpdb->update( $wpdb->prefix . 'merodiet_recipes', $fields, array( 'id' => $id ) );

		return false !== $updated;
	}

	/**
	 * Delete a recipe and its items.
	 *
	 * @param int $id Internal recipe ID.
	 */
	public function delete( int $id ): bool {
		global $wpdb;

		$wpdb->delete( $wpdb->prefix . 'merodiet_recipe_items', array( 'recipe_id' => $id ) );

		return false !== $wpdb->delete( $wpdb->prefix . 'merodiet_recipes', array( 'id' => $id ) );
	}

	/**
	 * Convert a raw database row into typed fields.
	 *
	 * @param array<string, mixed> $row Raw database row.
	 *
	 * @return array<string, mixed>
	 */
	private function hydrate( array $row ): array {
		$row['id']                   = (int) $row['id'];
		$row['practitioner_user_id'] = (int) $row['practitioner_user_id'];
		$row['servings']             = (int) $row['servings'];

		return $row;
	}
}
