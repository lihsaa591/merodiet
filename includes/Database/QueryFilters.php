<?php
/**
 * Shared WHERE-clause builders for a repository's filterable list query.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Database;

/**
 * Every practitioner-owned list (clients, recipes, plans, custom foods)
 * needs the same small set of filter shapes — a free-text search across
 * a few columns, an exact-match filter (status, etc.) — so this is the
 * one place that logic lives, rather than four near-identical copies.
 * Pure SQL-fragment building, no $wpdb query execution: a repository
 * calls these to build up its own WHERE clause and bound params, then
 * runs the query itself (see ClientRepository::all_for_practitioner()
 * for the calling pattern). Adding a new filter kind later (a date
 * range, a numeric comparison, ...) means adding one more method here,
 * not touching every repository.
 */
final class QueryFilters {

	/**
	 * A free-text search across one or more columns, ORed together
	 * (e.g. a client's name OR email). Returns null (and leaves $params
	 * untouched) if the filter wasn't supplied — callers should skip
	 * adding anything to their WHERE clause in that case.
	 *
	 * @param array<string, mixed> $filters Filter values, keyed by filter name.
	 * @param string               $key     Which key in $filters holds the search term (usually 'search').
	 * @param string[]             $columns Columns to search across.
	 * @param array<int, mixed>    $params  Bound params array to append to, by reference.
	 */
	public static function search_clause( array $filters, string $key, array $columns, array &$params ): ?string {
		global $wpdb;

		$term = trim( (string) ( $filters[ $key ] ?? '' ) );

		if ( '' === $term || array() === $columns ) {
			return null;
		}

		$like       = '%' . $wpdb->esc_like( $term ) . '%';
		$conditions = array();

		foreach ( $columns as $column ) {
			$conditions[] = "{$column} LIKE %s"; // phpcs:ignore WordPress.DB.PreparedSQLPlaceholders -- column name is a caller-supplied literal, not user input; the %s placeholder itself is filled via $wpdb->prepare() by the caller.
			$params[]     = $like;
		}

		return '(' . implode( ' OR ', $conditions ) . ')';
	}

	/**
	 * An exact-match filter against one column (e.g. status = 'active').
	 * Returns null (and leaves $params untouched) if the filter wasn't
	 * supplied.
	 *
	 * @param array<string, mixed> $filters Filter values, keyed by filter name.
	 * @param string               $key     Which key in $filters holds the value.
	 * @param string               $column  Column to match against.
	 * @param array<int, mixed>    $params  Bound params array to append to, by reference.
	 */
	public static function exact_clause( array $filters, string $key, string $column, array &$params ): ?string {
		$value = trim( (string) ( $filters[ $key ] ?? '' ) );

		if ( '' === $value ) {
			return null;
		}

		$params[] = $value;

		return "{$column} = %s"; // phpcs:ignore WordPress.DB.PreparedSQLPlaceholders -- column name is a caller-supplied literal, not user input; the %s placeholder itself is filled via $wpdb->prepare() by the caller.
	}

	/**
	 * An inclusive date-range filter against one column — used by any
	 * list that supports a "from"/"to" window (log entries,
	 * measurements). Either bound may be supplied alone for an
	 * open-ended range. Returns null (and leaves $params untouched) if
	 * neither bound was supplied.
	 *
	 * @param array<string, mixed> $filters Filter values, keyed by filter name.
	 * @param string               $from_key Which key in $filters holds the inclusive lower bound.
	 * @param string               $to_key   Which key in $filters holds the inclusive upper bound.
	 * @param string               $column   Column to range against.
	 * @param array<int, mixed>    $params   Bound params array to append to, by reference.
	 */
	public static function date_range_clause( array $filters, string $from_key, string $to_key, string $column, array &$params ): ?string {
		$from = trim( (string) ( $filters[ $from_key ] ?? '' ) );
		$to   = trim( (string) ( $filters[ $to_key ] ?? '' ) );

		$conditions = array();

		if ( '' !== $from ) {
			$conditions[] = "{$column} >= %s"; // phpcs:ignore WordPress.DB.PreparedSQLPlaceholders -- column name is a caller-supplied literal, not user input; the %s placeholder itself is filled via $wpdb->prepare() by the caller.
			$params[]     = $from;
		}

		if ( '' !== $to ) {
			$conditions[] = "{$column} <= %s"; // phpcs:ignore WordPress.DB.PreparedSQLPlaceholders -- column name is a caller-supplied literal, not user input; the %s placeholder itself is filled via $wpdb->prepare() by the caller.
			$params[]     = $to;
		}

		if ( array() === $conditions ) {
			return null;
		}

		return implode( ' AND ', $conditions );
	}

	/**
	 * Combine a base condition (e.g. "practitioner_user_id = %d", already
	 * in $params) with every non-null filter clause, ANDed together.
	 *
	 * @param string             $base_clause   The query's own base WHERE condition.
	 * @param array<string|null> $filter_clauses Output of search_clause()/exact_clause() calls — null entries are skipped.
	 */
	public static function combine( string $base_clause, array $filter_clauses ): string {
		$clauses = array( $base_clause );

		foreach ( $filter_clauses as $clause ) {
			if ( null !== $clause ) {
				$clauses[] = $clause;
			}
		}

		return implode( ' AND ', $clauses );
	}
}
