<?php
/**
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Tests\Unit\RestApi;

use Nutrio\Clients\ClientInviteService;
use Nutrio\Clients\ComplianceCalculator;
use Nutrio\Repositories\ClientRepository;
use Nutrio\Repositories\LogEntryRepository;
use Nutrio\Repositories\MeasurementRepository;
use Nutrio\Repositories\PlanRepository;
use Nutrio\RestApi\ClientsController;
use Nutrio\Tests\TestCase;
use WP_REST_Request;

/**
 * Proves the new per-client report routes enforce the same
 * ownership check as every other owned resource — a practitioner
 * fetching another practitioner's client gets a 404, identically to
 * the existing GET /clients/{id} route, never the data itself.
 *
 * ClientInviteService and ComplianceCalculator are both declared
 * `final`, so PHPUnit can't double them directly (see
 * ControllerCapabilitiesTest::build_dependency_mock() for the same
 * pattern applied elsewhere) — they're constructed for real here, with
 * their own dependencies mocked instead.
 */
final class ClientsControllerComplianceTest extends TestCase {

	private function make_controller(
		ClientRepository $clients,
		?LogEntryRepository $logs = null,
		?MeasurementRepository $measurements = null,
		?ComplianceCalculator $compliance = null
	): ClientsController {
		return new ClientsController(
			$clients,
			new ClientInviteService( $this->createMock( ClientRepository::class ) ),
			$logs ?? $this->createMock( LogEntryRepository::class ),
			$measurements ?? $this->createMock( MeasurementRepository::class ),
			$compliance ?? new ComplianceCalculator(
				$this->createMock( PlanRepository::class ),
				$this->createMock( LogEntryRepository::class )
			)
		);
	}

	public function test_get_logs_returns_404_for_another_practitioners_client(): void {
		\Brain\Monkey\Functions\when( 'get_current_user_id' )->justReturn( 42 );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_practitioner' )->with( 7, 42 )->willReturn( null );

		$request = new WP_REST_Request();
		$request->set_param( 'id', 7 );

		$result = $this->make_controller( $clients )->get_client_logs( $request );

		self::assertInstanceOf( \WP_Error::class, $result );
		self::assertSame( 404, $result->get_error_data()['status'] );
	}

	public function test_get_measurements_returns_404_for_another_practitioners_client(): void {
		\Brain\Monkey\Functions\when( 'get_current_user_id' )->justReturn( 42 );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_practitioner' )->with( 7, 42 )->willReturn( null );

		$request = new WP_REST_Request();
		$request->set_param( 'id', 7 );

		$result = $this->make_controller( $clients )->get_client_measurements( $request );

		self::assertInstanceOf( \WP_Error::class, $result );
		self::assertSame( 404, $result->get_error_data()['status'] );
	}

	public function test_get_compliance_returns_404_for_another_practitioners_client(): void {
		\Brain\Monkey\Functions\when( 'get_current_user_id' )->justReturn( 42 );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_practitioner' )->with( 7, 42 )->willReturn( null );

		$request = new WP_REST_Request();
		$request->set_param( 'id', 7 );

		$result = $this->make_controller( $clients )->get_client_compliance( $request );

		self::assertInstanceOf( \WP_Error::class, $result );
		self::assertSame( 404, $result->get_error_data()['status'] );
	}

	public function test_get_compliance_calls_calculator_with_resolved_client_and_window(): void {
		\Brain\Monkey\Functions\when( 'get_current_user_id' )->justReturn( 42 );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_practitioner' )->with( 7, 42 )->willReturn(
			array( 'id' => 7, 'practitioner_user_id' => 42 )
		);

		// ComplianceCalculator is final and can't be doubled directly, so
		// the assertion is made one layer down: proving calculate() reached
		// find_active_for_client() with this exact client id and window is
		// equivalent to proving the controller resolved and passed them
		// correctly — with no active plan, calculate() short-circuits to
		// the all-null/zero shape asserted below.
		$plans = $this->createMock( PlanRepository::class );
		$plans->expects( self::once() )
			->method( 'find_active_for_client' )
			->with( 7, '2026-09-07' )
			->willReturn( null );

		$compliance = new ComplianceCalculator( $plans, $this->createMock( LogEntryRepository::class ) );

		$request = new WP_REST_Request();
		$request->set_param( 'id', 7 );
		$request->set_param( 'from', '2026-09-01' );
		$request->set_param( 'to', '2026-09-07' );

		$result = $this->make_controller( $clients, null, null, $compliance )->get_client_compliance( $request );

		self::assertSame(
			array(
				'plan'         => null,
				'percent'      => null,
				'logged_count' => 0,
				'total_count'  => 0,
				'window'       => array(
					'from' => '2026-09-01',
					'to'   => '2026-09-07',
				),
			),
			$result->data
		);
	}
}
