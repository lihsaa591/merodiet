<?php
/**
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Tests\Unit\RestApi;

use Brain\Monkey\Functions;
use Nutrio\Nutrition\FoodCache;
use Nutrio\Repositories\ClientRepository;
use Nutrio\Repositories\LogEntryRepository;
use Nutrio\Repositories\MeasurementRepository;
use Nutrio\Repositories\PlanRepository;
use Nutrio\Repositories\RecipeRepository;
use Nutrio\RestApi\MeController;
use Nutrio\Tests\TestCase;
use WP_REST_Request;

/**
 * Proves the client-portal's central security claim: client_id is
 * always resolved server-side via current_client_id(), never taken
 * from the request body — even when a request tries to smuggle a
 * different client_id alongside otherwise-valid fields.
 */
final class MeControllerTest extends TestCase {

	public function test_create_log_uses_resolved_client_id_never_the_request_body(): void {
		Functions\when( 'get_current_user_id' )->justReturn( 42 );
		Functions\when( 'current_time' )->alias( static fn () => '2026-09-19' );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_user' )
			->with( 42 )
			->willReturn( array( 'id' => 7 ) );

		$logs = $this->createMock( LogEntryRepository::class );
		$logs->expects( self::once() )
			->method( 'create_for_client' )
			->with( 7, self::anything() )
			->willReturn( 123 );
		$logs->method( 'find' )->with( 123 )->willReturn( array( 'id' => 123 ) );

		$controller = new MeController(
			$this->createMock( PlanRepository::class ),
			$logs,
			$this->createMock( MeasurementRepository::class ),
			$clients,
			$this->createMock( FoodCache::class ),
			$this->createMock( RecipeRepository::class )
		);

		$request = new WP_REST_Request();
		$request->set_param( 'client_id', 999 ); // Smuggled — must be ignored.
		$request->set_param( 'log_date', '2026-09-19' );
		$request->set_param( 'status', 'eaten' );

		$response = $controller->create_log( $request );

		self::assertSame( 201, $response->status );
	}

	public function test_create_measurement_uses_resolved_client_id_never_the_request_body(): void {
		Functions\when( 'get_current_user_id' )->justReturn( 42 );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_user' )
			->with( 42 )
			->willReturn( array( 'id' => 7 ) );

		$measurements = $this->createMock( MeasurementRepository::class );
		$measurements->expects( self::once() )
			->method( 'create_for_client' )
			->with( 7, self::anything() )
			->willReturn( 456 );
		$measurements->method( 'find' )->with( 456 )->willReturn( array( 'id' => 456 ) );

		$controller = new MeController(
			$this->createMock( PlanRepository::class ),
			$this->createMock( LogEntryRepository::class ),
			$measurements,
			$clients,
			$this->createMock( FoodCache::class ),
			$this->createMock( RecipeRepository::class )
		);

		$request = new WP_REST_Request();
		$request->set_param( 'client_id', 999 ); // Smuggled — must be ignored.
		$request->set_param( 'measured_at', '2026-09-19' );

		$response = $controller->create_measurement( $request );

		self::assertSame( 201, $response->status );
	}
}
