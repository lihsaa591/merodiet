<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit\Database;

use MeroDiet\Database\QueryFilters;
use MeroDiet\Tests\TestCase;

final class QueryFiltersTest extends TestCase {

	public function test_date_range_clause_returns_null_when_neither_bound_supplied(): void {
		$params = array();

		$clause = QueryFilters::date_range_clause( array(), 'from', 'to', 'log_date', $params );

		self::assertNull( $clause );
		self::assertSame( array(), $params );
	}

	public function test_date_range_clause_combines_both_bounds_with_and(): void {
		$params = array();

		$clause = QueryFilters::date_range_clause(
			array(
				'from' => '2026-09-01',
				'to'   => '2026-09-30',
			),
			'from',
			'to',
			'log_date',
			$params
		);

		self::assertSame( 'log_date >= %s AND log_date <= %s', $clause );
		self::assertSame( array( '2026-09-01', '2026-09-30' ), $params );
	}

	public function test_date_range_clause_supports_a_single_open_ended_bound(): void {
		$params = array();

		$clause = QueryFilters::date_range_clause(
			array( 'from' => '2026-09-01' ),
			'from',
			'to',
			'log_date',
			$params
		);

		self::assertSame( 'log_date >= %s', $clause );
		self::assertSame( array( '2026-09-01' ), $params );
	}
}
