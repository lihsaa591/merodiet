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

	/**
	 * handle_request() itself calls exit() on every branch, which would
	 * kill the PHPUnit process, so this pins the exit()-free guard method
	 * it delegates to instead: current_user_is_a_linked_client() resolves
	 * identity only from the WP_User handed to it (i.e. from
	 * get_current_user_id() via wp_get_current_user() in production),
	 * never from request data. A URL-supplied client_id is set here only
	 * to demonstrate it has no effect on which user ID is looked up.
	 */
	public function test_current_user_is_a_linked_client_ignores_a_url_supplied_client_id_and_uses_only_the_session_identity(): void {
		$user = $this->createMock( WP_User::class );
		$user->method( 'has_cap' )->with( 'view_own_nutrio_plan' )->willReturn( true );
		$user->ID = 42;

		$clients = $this->createMock( ClientRepository::class );
		$clients->expects( self::once() )
			->method( 'find_for_user' )
			->with( 42 )
			->willReturn( array( 'id' => 7 ) );

		// A malicious $_GET['client_id'] must have no effect — the guard
		// never reads superglobals for identity, only the WP_User it is
		// handed (which production code resolves via
		// wp_get_current_user()/get_current_user_id()).
		$_GET['client_id'] = '999';

		$page = new PortalPage( $clients );

		self::assertTrue( $page->current_user_is_a_linked_client( $user ) );

		unset( $_GET['client_id'] );
	}

	public function test_current_user_is_a_linked_client_is_false_when_the_user_has_the_capability_but_no_linked_client_row(): void {
		$user = $this->createMock( WP_User::class );
		$user->method( 'has_cap' )->with( 'view_own_nutrio_plan' )->willReturn( true );
		$user->ID = 42;

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_user' )->with( 42 )->willReturn( null );

		$page = new PortalPage( $clients );

		self::assertFalse( $page->current_user_is_a_linked_client( $user ) );
	}
}
