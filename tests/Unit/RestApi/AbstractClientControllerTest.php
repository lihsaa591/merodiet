<?php
/**
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Tests\Unit\RestApi;

use Brain\Monkey\Functions;
use Nutrio\Repositories\ClientRepository;
use Nutrio\RestApi\AbstractClientController;
use Nutrio\Tests\TestCase;
use WP_Error;

final class AbstractClientControllerTest extends TestCase {

	public function test_current_client_id_resolves_via_the_logged_in_user(): void {
		Functions\when( 'get_current_user_id' )->justReturn( 42 );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_user' )
			->with( 42 )
			->willReturn( array( 'id' => 7 ) );

		$controller = new class( $clients ) extends AbstractClientController {
			protected string $rest_base = 'me';
			public function __construct( private readonly ClientRepository $clients ) {}
			protected function client_repository(): ClientRepository {
				return $this->clients;
			}
			public function register_routes(): void {}
		};

		self::assertSame( 7, $controller->current_client_id() );
	}

	public function test_current_client_id_errors_when_no_client_is_linked(): void {
		Functions\when( 'get_current_user_id' )->justReturn( 42 );
		Functions\when( '__' )->returnArg( 1 );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_user' )->willReturn( null );

		$controller = new class( $clients ) extends AbstractClientController {
			protected string $rest_base = 'me';
			public function __construct( private readonly ClientRepository $clients ) {}
			protected function client_repository(): ClientRepository {
				return $this->clients;
			}
			public function register_routes(): void {}
		};

		self::assertInstanceOf( WP_Error::class, $controller->current_client_id() );
	}
}
