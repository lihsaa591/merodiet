<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit\Clients;

use MeroDiet\Clients\ComplianceCalculator;
use MeroDiet\Repositories\LogEntryRepository;
use MeroDiet\Repositories\PlanRepository;
use MeroDiet\Tests\TestCase;

final class ComplianceCalculatorTest extends TestCase {

	private function make_calculator( PlanRepository $plans, LogEntryRepository $logs ): ComplianceCalculator {
		return new ComplianceCalculator( $plans, $logs );
	}

	public function test_no_active_plan_returns_null_plan_and_null_percent(): void {
		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'find_active_for_client' )->willReturn( null );

		$logs = $this->createMock( LogEntryRepository::class );
		$logs->expects( self::never() )->method( 'all_for_client' );

		$result = $this->make_calculator( $plans, $logs )->calculate( 7, '2026-09-01', '2026-09-07' );

		self::assertNull( $result['plan'] );
		self::assertNull( $result['percent'] );
		self::assertSame( 0, $result['logged_count'] );
		self::assertSame( 0, $result['total_count'] );
	}

	public function test_fully_logged_plan_is_100_percent(): void {
		$plan = array(
			'id'         => 3,
			'title'      => 'Week 1',
			'start_date' => '2026-09-01',
			'end_date'   => '2026-09-07',
		);

		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'find_active_for_client' )->willReturn( $plan );
		$plans->method( 'days_for_plan' )->with( 3 )->willReturn(
			array(
				array( 'id' => 10, 'plan_id' => 3, 'day_offset' => 0 ),
				array( 'id' => 11, 'plan_id' => 3, 'day_offset' => 1 ),
			)
		);
		$plans->method( 'items_for_day' )->willReturnMap(
			array(
				array( 10, array( array( 'id' => 100 ), array( 'id' => 101 ) ) ),
				array( 11, array( array( 'id' => 102 ) ) ),
			)
		);

		$logs = $this->createMock( LogEntryRepository::class );
		$logs->method( 'all_for_client' )->willReturn(
			array(
				array( 'plan_item_id' => 100, 'log_date' => '2026-09-01' ),
				array( 'plan_item_id' => 101, 'log_date' => '2026-09-01' ),
				array( 'plan_item_id' => 102, 'log_date' => '2026-09-02' ),
			)
		);

		$result = $this->make_calculator( $plans, $logs )->calculate( 7, '2026-09-01', '2026-09-07' );

		self::assertSame( $plan['id'], $result['plan']['id'] );
		self::assertSame( 3, $result['total_count'] );
		self::assertSame( 3, $result['logged_count'] );
		self::assertSame( 100, $result['percent'] );
	}

	public function test_partially_logged_plan_computes_correct_percent(): void {
		$plan = array(
			'id'         => 3,
			'title'      => 'Week 1',
			'start_date' => '2026-09-01',
			'end_date'   => '2026-09-07',
		);

		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'find_active_for_client' )->willReturn( $plan );
		$plans->method( 'days_for_plan' )->willReturn(
			array( array( 'id' => 10, 'plan_id' => 3, 'day_offset' => 0 ) )
		);
		$plans->method( 'items_for_day' )->willReturn(
			array( array( 'id' => 100 ), array( 'id' => 101 ), array( 'id' => 102 ), array( 'id' => 103 ) )
		);

		$logs = $this->createMock( LogEntryRepository::class );
		$logs->method( 'all_for_client' )->willReturn(
			array( array( 'plan_item_id' => 100, 'log_date' => '2026-09-01' ) )
		);

		$result = $this->make_calculator( $plans, $logs )->calculate( 7, '2026-09-01', '2026-09-07' );

		self::assertSame( 4, $result['total_count'] );
		self::assertSame( 1, $result['logged_count'] );
		self::assertSame( 25, $result['percent'] );
	}

	public function test_a_plan_item_logged_twice_still_counts_once(): void {
		$plan = array( 'id' => 3, 'title' => 'Week 1', 'start_date' => '2026-09-01', 'end_date' => '2026-09-07' );

		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'find_active_for_client' )->willReturn( $plan );
		$plans->method( 'days_for_plan' )->willReturn(
			array( array( 'id' => 10, 'plan_id' => 3, 'day_offset' => 0 ) )
		);
		$plans->method( 'items_for_day' )->willReturn( array( array( 'id' => 100 ) ) );

		$logs = $this->createMock( LogEntryRepository::class );
		$logs->method( 'all_for_client' )->willReturn(
			array(
				array( 'plan_item_id' => 100, 'log_date' => '2026-09-01' ),
				array( 'plan_item_id' => 100, 'log_date' => '2026-09-01' ),
			)
		);

		$result = $this->make_calculator( $plans, $logs )->calculate( 7, '2026-09-01', '2026-09-07' );

		self::assertSame( 1, $result['total_count'] );
		self::assertSame( 1, $result['logged_count'] );
		self::assertSame( 100, $result['percent'] );
	}

	public function test_ad_hoc_log_entries_are_excluded(): void {
		$plan = array( 'id' => 3, 'title' => 'Week 1', 'start_date' => '2026-09-01', 'end_date' => '2026-09-07' );

		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'find_active_for_client' )->willReturn( $plan );
		$plans->method( 'days_for_plan' )->willReturn(
			array( array( 'id' => 10, 'plan_id' => 3, 'day_offset' => 0 ) )
		);
		$plans->method( 'items_for_day' )->willReturn( array( array( 'id' => 100 ) ) );

		$logs = $this->createMock( LogEntryRepository::class );
		$logs->method( 'all_for_client' )->willReturn(
			array(
				array( 'plan_item_id' => 100, 'log_date' => '2026-09-01' ),
				array( 'plan_item_id' => null, 'log_date' => '2026-09-01' ), // ad-hoc, no plan item.
			)
		);

		$result = $this->make_calculator( $plans, $logs )->calculate( 7, '2026-09-01', '2026-09-07' );

		self::assertSame( 1, $result['total_count'] );
		self::assertSame( 1, $result['logged_count'] );
	}

	public function test_window_narrower_than_plan_only_counts_overlapping_days(): void {
		// Plan runs Sep 1-7 (day_offset 0-6); window only covers Sep 1-2
		// (day_offset 0-1) — day_offset 2's items must not be counted.
		$plan = array( 'id' => 3, 'title' => 'Week 1', 'start_date' => '2026-09-01', 'end_date' => '2026-09-07' );

		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'find_active_for_client' )->willReturn( $plan );
		$plans->method( 'days_for_plan' )->willReturn(
			array(
				array( 'id' => 10, 'plan_id' => 3, 'day_offset' => 0 ),
				array( 'id' => 11, 'plan_id' => 3, 'day_offset' => 1 ),
				array( 'id' => 12, 'plan_id' => 3, 'day_offset' => 2 ),
			)
		);
		$plans->method( 'items_for_day' )->willReturnMap(
			array(
				array( 10, array( array( 'id' => 100 ) ) ),
				array( 11, array( array( 'id' => 101 ) ) ),
				array( 12, array( array( 'id' => 999 ) ) ), // outside the window.
			)
		);

		$logs = $this->createMock( LogEntryRepository::class );
		$logs->method( 'all_for_client' )->willReturn(
			array(
				array( 'plan_item_id' => 100, 'log_date' => '2026-09-01' ),
				array( 'plan_item_id' => 101, 'log_date' => '2026-09-02' ),
			)
		);

		$result = $this->make_calculator( $plans, $logs )->calculate( 7, '2026-09-01', '2026-09-02' );

		self::assertSame( 2, $result['total_count'] );
		self::assertSame( 2, $result['logged_count'] );
		self::assertSame( 100, $result['percent'] );
	}

	public function test_active_plan_with_no_items_in_window_returns_null_percent(): void {
		// Plan is active (Sep 1-7), but its only day falls outside the
		// requested window — zero scheduled items in-window, so percent
		// must be null, not 0.
		$plan = array( 'id' => 3, 'title' => 'Week 1', 'start_date' => '2026-09-01', 'end_date' => '2026-09-07' );

		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'find_active_for_client' )->willReturn( $plan );
		$plans->method( 'days_for_plan' )->willReturn(
			array( array( 'id' => 10, 'plan_id' => 3, 'day_offset' => 6 ) )
		);
		$plans->method( 'items_for_day' )->willReturn( array( array( 'id' => 100 ) ) );

		$logs = $this->createMock( LogEntryRepository::class );
		$logs->method( 'all_for_client' )->willReturn( array() );

		$result = $this->make_calculator( $plans, $logs )->calculate( 7, '2026-09-01', '2026-09-02' );

		self::assertNotNull( $result['plan'] );
		self::assertSame( 0, $result['total_count'] );
		self::assertSame( 0, $result['logged_count'] );
		self::assertNull( $result['percent'] );
	}

	public function test_active_plan_with_days_but_no_items_returns_null_percent(): void {
		// Plan is active and its day is within the window, but that day
		// has no scheduled items at all — still zero total, so percent
		// must be null, not 0.
		$plan = array( 'id' => 3, 'title' => 'Week 1', 'start_date' => '2026-09-01', 'end_date' => '2026-09-07' );

		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'find_active_for_client' )->willReturn( $plan );
		$plans->method( 'days_for_plan' )->willReturn(
			array( array( 'id' => 10, 'plan_id' => 3, 'day_offset' => 0 ) )
		);
		$plans->method( 'items_for_day' )->willReturn( array() );

		$logs = $this->createMock( LogEntryRepository::class );
		$logs->method( 'all_for_client' )->willReturn( array() );

		$result = $this->make_calculator( $plans, $logs )->calculate( 7, '2026-09-01', '2026-09-07' );

		self::assertNotNull( $result['plan'] );
		self::assertSame( 0, $result['total_count'] );
		self::assertNull( $result['percent'] );
	}
}
