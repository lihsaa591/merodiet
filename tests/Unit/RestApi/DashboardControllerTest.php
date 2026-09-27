<?php
/**
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Tests\Unit\RestApi;

use Nutrio\Clients\ComplianceCalculator;
use Nutrio\Repositories\ClientRepository;
use Nutrio\Repositories\LogEntryRepository;
use Nutrio\Repositories\PlanRepository;
use Nutrio\RestApi\DashboardController;
use Nutrio\Tests\TestCase;
use WP_REST_Request;

final class DashboardControllerTest extends TestCase {

	public function test_empty_roster_returns_all_zeros_and_empty_compliance(): void {
		\Brain\Monkey\Functions\when( 'get_current_user_id' )->justReturn( 42 );
		\Brain\Monkey\Functions\when( 'current_time' )->alias( static fn () => '2026-09-26' );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'all_for_practitioner' )->willReturn( array( 'items' => array(), 'total' => 0 ) );

		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'all_for_practitioner' )->willReturn( array( 'items' => array(), 'total' => 0 ) );

		// ComplianceCalculator is final and can't be doubled directly (see
		// ClientsControllerComplianceTest for the same pattern), so it's
		// constructed for real with mocked repositories underneath. An
		// empty roster means the controller's loop never calls calculate()
		// at all, so find_active_for_client() must never be reached.
		$calc_plans = $this->createMock( PlanRepository::class );
		$calc_plans->expects( self::never() )->method( 'find_active_for_client' );
		$compliance = new ComplianceCalculator( $calc_plans, $this->createMock( LogEntryRepository::class ) );

		$logs = $this->createMock( LogEntryRepository::class );
		$logs->expects( self::never() )->method( 'all_for_client' );

		$controller = new DashboardController( $clients, $plans, $compliance, $logs );

		$response = $controller->get_overview( new WP_REST_Request() );
		$data     = $response->get_data();

		self::assertSame( 0, $data['active_client_count'] );
		self::assertSame( 0, $data['clients_without_plan_count'] );
		self::assertSame( 0, $data['logged_today_count'] );
		self::assertSame( 0, $data['draft_plan_count'] );
		self::assertSame( array(), $data['compliance'] );
	}

	public function test_mixed_roster_sorts_compliance_worst_first_and_excludes_no_plan_clients(): void {
		\Brain\Monkey\Functions\when( 'get_current_user_id' )->justReturn( 42 );
		\Brain\Monkey\Functions\when( 'current_time' )->alias( static fn () => '2026-09-26' );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'all_for_practitioner' )->willReturn(
			array(
				'items' => array(
					array( 'id' => 1, 'first_name' => 'A', 'last_name' => 'One' ),
					array( 'id' => 2, 'first_name' => 'B', 'last_name' => 'Two' ),
					array( 'id' => 3, 'first_name' => 'C', 'last_name' => 'Three' ), // no plan.
				),
				'total' => 3,
			)
		);

		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'all_for_practitioner' )->willReturn( array( 'items' => array(), 'total' => 0 ) );

		// Drive the real ComplianceCalculator to the exact percentages the
		// brief specifies: client 1 at 80% (4/5), client 2 at 20% (1/5),
		// client 3 with no active plan at all.
		$calc_plans = $this->createMock( PlanRepository::class );
		$calc_plans->method( 'find_active_for_client' )->willReturnMap(
			array(
				array( 1, '2026-09-26', array( 'id' => 10, 'title' => 'P1', 'start_date' => '2026-09-20', 'end_date' => '2026-09-26' ) ),
				array( 2, '2026-09-26', array( 'id' => 11, 'title' => 'P2', 'start_date' => '2026-09-20', 'end_date' => '2026-09-26' ) ),
				array( 3, '2026-09-26', null ),
			)
		);
		$calc_plans->method( 'days_for_plan' )->willReturnMap(
			array(
				array( 10, array(
					array( 'id' => 1, 'plan_id' => 10, 'day_offset' => 0 ),
					array( 'id' => 2, 'plan_id' => 10, 'day_offset' => 1 ),
					array( 'id' => 3, 'plan_id' => 10, 'day_offset' => 2 ),
					array( 'id' => 4, 'plan_id' => 10, 'day_offset' => 3 ),
					array( 'id' => 5, 'plan_id' => 10, 'day_offset' => 4 ),
				) ),
				array( 11, array(
					array( 'id' => 6, 'plan_id' => 11, 'day_offset' => 0 ),
					array( 'id' => 7, 'plan_id' => 11, 'day_offset' => 1 ),
					array( 'id' => 8, 'plan_id' => 11, 'day_offset' => 2 ),
					array( 'id' => 9, 'plan_id' => 11, 'day_offset' => 3 ),
					array( 'id' => 10, 'plan_id' => 11, 'day_offset' => 4 ),
				) ),
			)
		);
		$calc_plans->method( 'items_for_day' )->willReturnCallback(
			static function ( int $plan_day_id ): array {
				return array(
					array(
						'id'             => $plan_day_id * 100,
						'meal_type'      => 'breakfast',
						'food_id'        => null,
						'recipe_id'      => null,
						'quantity_grams' => null,
						'servings'       => null,
					),
				);
			}
		);

		$logs = $this->createMock( LogEntryRepository::class );
		$logs->method( 'all_for_client' )->willReturnMap(
			array(
				array(
					1,
					array( 'from' => '2026-09-20', 'to' => '2026-09-26' ),
					array(
						array( 'plan_item_id' => 100 ),
						array( 'plan_item_id' => 200 ),
						array( 'plan_item_id' => 300 ),
						array( 'plan_item_id' => 400 ),
					),
				),
				array(
					2,
					array( 'from' => '2026-09-20', 'to' => '2026-09-26' ),
					array(
						array( 'plan_item_id' => 600 ),
					),
				),
			)
		);

		$compliance = new ComplianceCalculator( $calc_plans, $logs );

		// A separate LogEntryRepository instance for the controller's own
		// "logged today" check (raw activity, independent of
		// ComplianceCalculator) — client 1 logged something specifically
		// today (an ad-hoc entry, proving this isn't scoped to scheduled
		// plan items), client 2 did not.
		$today_logs = $this->createMock( LogEntryRepository::class );
		$today_logs->method( 'all_for_client' )->willReturnMap(
			array(
				array( 1, array( 'from' => '2026-09-26', 'to' => '2026-09-26' ), array( array( 'plan_item_id' => null ) ) ),
				array( 2, array( 'from' => '2026-09-26', 'to' => '2026-09-26' ), array() ),
			)
		);

		$controller = new DashboardController( $clients, $plans, $compliance, $today_logs );

		$response = $controller->get_overview( new WP_REST_Request() );
		$data     = $response->get_data();

		self::assertSame( 1, $data['clients_without_plan_count'] );
		// Only client 1 logged something specifically today (not just
		// within the wider 7-day compliance window) — proves
		// logged_today_count is scoped to today, not the whole window.
		self::assertSame( 1, $data['logged_today_count'] );
		self::assertCount( 2, $data['compliance'] );
		self::assertSame( 2, $data['compliance'][0]['client_id'] ); // 20% first (worst).
		self::assertSame( 20, $data['compliance'][0]['percent'] );
		self::assertSame( 1, $data['compliance'][1]['client_id'] ); // 80% second.
		self::assertSame( 80, $data['compliance'][1]['percent'] );
	}

	public function test_client_with_active_plan_but_no_items_in_window_is_excluded_from_compliance(): void {
		\Brain\Monkey\Functions\when( 'get_current_user_id' )->justReturn( 42 );
		\Brain\Monkey\Functions\when( 'current_time' )->alias( static fn () => '2026-09-26' );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'all_for_practitioner' )->willReturn(
			array(
				'items' => array(
					array( 'id' => 1, 'first_name' => 'A', 'last_name' => 'One' ),
				),
				'total' => 1,
			)
		);

		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'all_for_practitioner' )->willReturn( array( 'items' => array(), 'total' => 0 ) );

		// Client 1 has an active plan, but its only scheduled day falls
		// outside the 7-day window — zero items in-window, so
		// ComplianceCalculator returns percent: null. This client must be
		// excluded from the compliance list (not treated as 0%/worst),
		// and must NOT be counted toward clients_without_plan_count since
		// they do have an active plan.
		$calc_plans = $this->createMock( PlanRepository::class );
		$calc_plans->method( 'find_active_for_client' )->willReturn(
			array( 'id' => 10, 'title' => 'Sparse plan', 'start_date' => '2026-09-01', 'end_date' => '2026-09-30' )
		);
		$calc_plans->method( 'days_for_plan' )->willReturn(
			array( array( 'id' => 1, 'plan_id' => 10, 'day_offset' => 0 ) ) // Sep 1 — outside the Sep 20-26 window.
		);
		$calc_plans->method( 'items_for_day' )->willReturn( array( array( 'id' => 100 ) ) );

		$logs = $this->createMock( LogEntryRepository::class );
		$logs->method( 'all_for_client' )->willReturn( array() );

		$compliance = new ComplianceCalculator( $calc_plans, $logs );

		$today_logs = $this->createMock( LogEntryRepository::class );
		$today_logs->method( 'all_for_client' )->willReturn( array() );

		$controller = new DashboardController( $clients, $plans, $compliance, $today_logs );

		$response = $controller->get_overview( new WP_REST_Request() );
		$data     = $response->get_data();

		self::assertSame( 0, $data['clients_without_plan_count'] );
		self::assertSame( array(), $data['compliance'] );
	}
}
