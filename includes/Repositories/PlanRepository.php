<?php
/**
 * Meal plan data access.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Repositories;

use Nutrio\Database\QueryFilters;

/**
 * A plan's days and items are replaced wholesale on update (delete-all
 * then re-insert), the same approach RecipeRepository takes for
 * ingredients — plans are small enough (a handful of days, a handful
 * of items per day) that diffing isn't worth the complexity. There is
 * no foreign key from plan_days/plan_items back to plans (dbDelta()
 * can't create one), so this class also enforces "deleting a plan
 * deletes its days and items" — that invariant lives here, not in the
 * database.
 */
class PlanRepository {

	/**
	 * Insert a new draft plan, owned by the given practitioner.
	 *
	 * @param int                                                                                                                                                                                                                              $practitioner_user_id Owning practitioner's user ID.
	 * @param array{title:string, start_date:string, end_date:string, client_id?:int, days:array<int, array{day_offset:int, items:array<int, array{meal_type:string, food_id?:int, recipe_id?:int, quantity_grams?:float, servings?:float}>}>} $data Plan fields, including its days and their items.
	 *
	 * @return int The new plan's internal ID.
	 */
	public function create( int $practitioner_user_id, array $data ): int {
		global $wpdb;

		$now = current_time( 'mysql' );

		$wpdb->insert(
			$wpdb->prefix . 'nutrio_plans',
			array(
				'practitioner_user_id' => $practitioner_user_id,
				'client_id'            => $data['client_id'] ?? null,
				'title'                => $data['title'],
				'status'               => 'draft',
				'start_date'           => $data['start_date'],
				'end_date'             => $data['end_date'],
				'created_at'           => $now,
				'updated_at'           => $now,
			)
		);

		$plan_id = (int) $wpdb->insert_id;

		$this->replace_days( $plan_id, $data['days'] );

		return $plan_id;
	}

	/**
	 * Find a plan by ID, regardless of owner — see
	 * ClientRepository::find()'s docblock for the same caveat: callers
	 * must verify ownership themselves.
	 *
	 * @param int $id Internal plan ID.
	 *
	 * @return array<string, mixed>|null
	 */
	public function find( int $id ): ?array {
		global $wpdb;

		$row = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}nutrio_plans WHERE id = %d", $id ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input; value is parameterized.
			ARRAY_A
		);

		return null === $row ? null : $this->hydrate( $row );
	}

	/**
	 * Find a plan by ID, scoped to the given practitioner.
	 *
	 * @param int $id                   Internal plan ID.
	 * @param int $practitioner_user_id Practitioner the plan must belong to.
	 *
	 * @return array<string, mixed>|null
	 */
	public function find_for_practitioner( int $id, int $practitioner_user_id ): ?array {
		global $wpdb;

		$row = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$wpdb->prefix}nutrio_plans WHERE id = %d AND practitioner_user_id = %d", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input; values are parameterized.
				$id,
				$practitioner_user_id
			),
			ARRAY_A
		);

		return null === $row ? null : $this->hydrate( $row );
	}

	/**
	 * The client's currently-active assigned plan for a given date, if
	 * any — the plan whose date range covers $date. Assumes plan date
	 * ranges for one client never overlap (a practitioner assigning a
	 * second overlapping plan is a product-level validation concern,
	 * not this query's); if that assumption is ever violated, this
	 * returns the most recently started of the overlapping plans.
	 *
	 * @param int    $client_id Client's internal ID.
	 * @param string $date      Date to check, 'Y-m-d'.
	 *
	 * @return array<string, mixed>|null
	 */
	public function find_active_for_client( int $client_id, string $date ): ?array {
		global $wpdb;

		$row = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$wpdb->prefix}nutrio_plans WHERE client_id = %d AND status = 'assigned' AND start_date <= %s AND end_date >= %s ORDER BY start_date DESC LIMIT 1", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input; values are parameterized.
				$client_id,
				$date,
				$date
			),
			ARRAY_A
		);

		return null === $row ? null : $this->hydrate( $row );
	}

	/**
	 * A page of plans belonging to a practitioner, most recently created
	 * first, plus the total count across all pages. $filters is
	 * deliberately open-ended — see QueryFilters — today supports
	 * 'search' (title) and 'status' (exact match); a future filter is one
	 * more QueryFilters call here, not a signature change.
	 *
	 * @param int                   $practitioner_user_id Owning practitioner's user ID.
	 * @param int                   $page                 1-indexed page number.
	 * @param int                   $per_page             Rows per page.
	 * @param array<string, string> $filters              Optional filters — 'search', 'status'.
	 *
	 * @return array{items: array<int, array<string, mixed>>, total: int}
	 */
	public function all_for_practitioner( int $practitioner_user_id, int $page = 1, int $per_page = 10, array $filters = array() ): array {
		global $wpdb;

		$table = $wpdb->prefix . 'nutrio_plans';

		$params = array( $practitioner_user_id );

		$where = QueryFilters::combine(
			'practitioner_user_id = %d',
			array(
				QueryFilters::search_clause( $filters, 'search', array( 'title' ), $params ),
				QueryFilters::exact_clause( $filters, 'status', 'status', $params ),
			)
		);

		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders -- table name and WHERE clause are built from fixed strings and caller-supplied literals, not user input; every value is bound via prepare()'s own placeholders. phpcs's static count of "%s"/"%d" tokens can't see through the ...$params spread.
		$total = (int) $wpdb->get_var(
			$wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE {$where}", ...$params )
		);

		$offset = max( 0, ( $page - 1 ) * $per_page );

		$found = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE {$where} ORDER BY created_at DESC LIMIT %d OFFSET %d",
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
	 * A plan's day rows, ordered by day_offset.
	 *
	 * @param int $plan_id Internal plan ID.
	 *
	 * @return array<int, array{id:int, plan_id:int, day_offset:int}>
	 */
	public function days_for_plan( int $plan_id ): array {
		global $wpdb;

		$found = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$wpdb->prefix}nutrio_plan_days WHERE plan_id = %d ORDER BY day_offset", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input; value is parameterized.
				$plan_id
			),
			ARRAY_A
		);

		$rows = null === $found ? array() : $found;

		return array_map(
			static fn ( array $row ) => array(
				'id'         => (int) $row['id'],
				'plan_id'    => (int) $row['plan_id'],
				'day_offset' => (int) $row['day_offset'],
			),
			$rows
		);
	}

	/**
	 * A day's item rows, in their stored order.
	 *
	 * @param int $plan_day_id Internal plan_days ID.
	 *
	 * @return array<int, array{id:int, meal_type:string, food_id:int|null, recipe_id:int|null, quantity_grams:float|null, servings:float|null}>
	 */
	public function items_for_day( int $plan_day_id ): array {
		global $wpdb;

		$found = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$wpdb->prefix}nutrio_plan_items WHERE plan_day_id = %d ORDER BY sort_order", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input; value is parameterized.
				$plan_day_id
			),
			ARRAY_A
		);

		$rows = null === $found ? array() : $found;

		return array_map(
			static fn ( array $row ) => array(
				'id'             => (int) $row['id'],
				'meal_type'      => (string) $row['meal_type'],
				'food_id'        => null === $row['food_id'] ? null : (int) $row['food_id'],
				'recipe_id'      => null === $row['recipe_id'] ? null : (int) $row['recipe_id'],
				'quantity_grams' => null === $row['quantity_grams'] ? null : (float) $row['quantity_grams'],
				'servings'       => null === $row['servings'] ? null : (float) $row['servings'],
			),
			$rows
		);
	}

	/**
	 * Delete every existing day (and its items) for a plan and insert
	 * the given set in its place — see class docblock for why this is
	 * wholesale, not diffed.
	 *
	 * @param int                                                                                                                                                $plan_id Internal plan ID.
	 * @param array<int, array{day_offset:int, items:array<int, array{meal_type:string, food_id?:int, recipe_id?:int, quantity_grams?:float, servings?:float}>}> $days    Days to store, each with its items.
	 */
	public function replace_days( int $plan_id, array $days ): void {
		global $wpdb;

		$existing_day_ids = array_column( $this->days_for_plan( $plan_id ), 'id' );

		if ( array() !== $existing_day_ids ) {
			$placeholders = implode( ',', array_fill( 0, count( $existing_day_ids ), '%d' ) );
			$wpdb->query(
				$wpdb->prepare(
					"DELETE FROM {$wpdb->prefix}nutrio_plan_items WHERE plan_day_id IN ({$placeholders})", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare -- table name is derived from $wpdb->prefix, not user input; $placeholders is a runtime-built "%d,%d,..." string PHPCS can't statically verify, but $wpdb->prepare() with an array as its second argument is the documented-correct pattern for a dynamic IN() clause.
					$existing_day_ids
				)
			);
		}

		$wpdb->delete( $wpdb->prefix . 'nutrio_plan_days', array( 'plan_id' => $plan_id ) );

		$now = current_time( 'mysql' );

		foreach ( $days as $day ) {
			$wpdb->insert(
				$wpdb->prefix . 'nutrio_plan_days',
				array(
					'plan_id'    => $plan_id,
					'day_offset' => $day['day_offset'],
					'created_at' => $now,
				)
			);

			$plan_day_id = (int) $wpdb->insert_id;

			foreach ( array_values( $day['items'] ) as $sort_order => $item ) {
				$wpdb->insert(
					$wpdb->prefix . 'nutrio_plan_items',
					array(
						'plan_day_id'    => $plan_day_id,
						'meal_type'      => $item['meal_type'],
						'food_id'        => $item['food_id'] ?? null,
						'recipe_id'      => $item['recipe_id'] ?? null,
						'quantity_grams' => $item['quantity_grams'] ?? null,
						'servings'       => $item['servings'] ?? null,
						'sort_order'     => $sort_order,
						'created_at'     => $now,
					)
				);
			}
		}
	}

	/**
	 * Update a plan's own fields — only keys present in $data are
	 * touched. Pass 'days' to also replace the plan's days and items.
	 *
	 * @param int                  $id   Internal plan ID.
	 * @param array<string, mixed> $data Fields to update.
	 */
	public function update( int $id, array $data ): bool {
		global $wpdb;

		$fields = array();

		foreach ( array( 'title', 'start_date', 'end_date', 'client_id' ) as $field ) {
			if ( array_key_exists( $field, $data ) ) {
				$fields[ $field ] = $data[ $field ];
			}
		}

		if ( array_key_exists( 'days', $data ) ) {
			$this->replace_days( $id, $data['days'] );
		}

		if ( array() === $fields ) {
			return true;
		}

		$fields['updated_at'] = current_time( 'mysql' );

		$updated = $wpdb->update( $wpdb->prefix . 'nutrio_plans', $fields, array( 'id' => $id ) );

		return false !== $updated;
	}

	/**
	 * Lock a plan in for a client, freezing its nutrient totals — see
	 * the plans migration's docblock for why the snapshot must never be
	 * silently recomputed after this point.
	 *
	 * @param int                         $id                Internal plan ID.
	 * @param int                         $client_id         Client this plan is being assigned to.
	 * @param array<int, array<int, int>> $nutrient_snapshot day_offset => {nutrient_id => amount}, in minor units.
	 */
	public function assign( int $id, int $client_id, array $nutrient_snapshot ): bool {
		global $wpdb;

		$updated = $wpdb->update(
			$wpdb->prefix . 'nutrio_plans',
			array(
				'client_id'         => $client_id,
				'status'            => 'assigned',
				'assigned_at'       => current_time( 'mysql' ),
				'nutrient_snapshot' => wp_json_encode( $nutrient_snapshot ),
				'updated_at'        => current_time( 'mysql' ),
			),
			array( 'id' => $id )
		);

		return false !== $updated;
	}

	/**
	 * Revert an assigned plan back to a draft — clears the client link,
	 * assignment timestamp, and frozen snapshot, so it becomes freely
	 * editable again. Used when a plan was assigned in error or needs a
	 * correction before the client has acted on it.
	 *
	 * @param int $id Internal plan ID.
	 */
	public function unassign( int $id ): bool {
		global $wpdb;

		$updated = $wpdb->update(
			$wpdb->prefix . 'nutrio_plans',
			array(
				'client_id'         => null,
				'status'            => 'draft',
				'assigned_at'       => null,
				'nutrient_snapshot' => null,
				'updated_at'        => current_time( 'mysql' ),
			),
			array( 'id' => $id )
		);

		return false !== $updated;
	}

	/**
	 * Delete a plan and its days/items.
	 *
	 * @param int $id Internal plan ID.
	 */
	public function delete( int $id ): bool {
		global $wpdb;

		$this->replace_days( $id, array() ); // Deletes all existing days/items, inserts none.

		return false !== $wpdb->delete( $wpdb->prefix . 'nutrio_plans', array( 'id' => $id ) );
	}

	/**
	 * Convert a raw database row into typed, decoded fields.
	 *
	 * @param array<string, mixed> $row Raw database row.
	 *
	 * @return array<string, mixed>
	 */
	private function hydrate( array $row ): array {
		$row['id']                   = (int) $row['id'];
		$row['practitioner_user_id'] = (int) $row['practitioner_user_id'];
		$row['client_id']            = null === $row['client_id'] ? null : (int) $row['client_id'];
		$row['nutrient_snapshot']    = null === $row['nutrient_snapshot'] ? null : (array) json_decode( (string) $row['nutrient_snapshot'], true );

		return $row;
	}
}
