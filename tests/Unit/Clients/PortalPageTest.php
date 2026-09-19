<?php
/**
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Tests\Unit\Clients;

use Brain\Monkey\Functions;
use Nutrio\Clients\PortalPage;
use Nutrio\Repositories\ClientRepository;
use Nutrio\Tests\TestCase;
use WP_User;

final class PortalPageTest extends TestCase {

	public function test_filter_login_redirect_sends_a_client_to_the_portal(): void {
		Functions\when( 'get_option' )->justReturn( '' );
		Functions\when( 'home_url' )->alias( static fn( string $path ) => 'https://example.test' . $path );

		$clients = $this->createMock( ClientRepository::class );
		$page    = new PortalPage( $clients );

		$user = $this->createMock( WP_User::class );
		$user->method( 'has_cap' )->with( 'view_own_nutrio_plan' )->willReturn( true );

		$result = $page->filter_login_redirect( 'https://example.test/wp-admin/', '', $user );

		self::assertSame( 'https://example.test/?nutrio_portal=1', $result );
	}

	public function test_filter_login_redirect_leaves_a_practitioner_untouched(): void {
		$clients = $this->createMock( ClientRepository::class );
		$page    = new PortalPage( $clients );

		$user = $this->createMock( WP_User::class );
		$user->method( 'has_cap' )->with( 'view_own_nutrio_plan' )->willReturn( false );

		$result = $page->filter_login_redirect( 'https://example.test/wp-admin/', '', $user );

		self::assertSame( 'https://example.test/wp-admin/', $result );
	}
}
