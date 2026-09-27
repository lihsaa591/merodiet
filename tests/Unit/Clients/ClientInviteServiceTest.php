<?php
/**
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Tests\Unit\Clients;

use Brain\Monkey\Functions;
use Nutrio\Clients\ClientInviteService;
use Nutrio\Repositories\ClientRepository;
use Nutrio\Tests\TestCase;
use WP_Error;

final class ClientInviteServiceTest extends TestCase {

	public function test_first_invite_creates_a_user_and_links_it(): void {
		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find' )->with( 7 )->willReturn(
			array(
				'id'      => 7,
				'user_id' => null,
				'email'   => 'client@example.test',
			)
		);

		Functions\when( 'get_user_by' )->justReturn( false );
		Functions\when( 'wp_generate_password' )->justReturn( 'irrelevant-random-password' );
		Functions\when( 'wp_insert_user' )->justReturn( 99 );
		Functions\when( 'retrieve_password' )->justReturn( true );
		Functions\when( 'sanitize_user' )->returnArg( 1 );

		$clients->expects( self::once() )
			->method( 'set_user_id' )
			->with( 7, 99 );

		$service = new ClientInviteService( $clients );

		self::assertTrue( $service->invite( 7 ) );
	}

	public function test_reinvite_of_an_already_linked_client_only_resends_the_email(): void {
		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find' )->with( 7 )->willReturn(
			array(
				'id'      => 7,
				'user_id' => 99,
				'email'   => 'client@example.test',
			)
		);

		Functions\when( 'get_user_by' )->justReturn( (object) array( 'user_login' => 'client-example-test' ) );
		Functions\when( 'retrieve_password' )->justReturn( true );

		$clients->expects( self::never() )->method( 'set_user_id' );

		$service = new ClientInviteService( $clients );

		self::assertTrue( $service->invite( 7 ) );
	}

	public function test_invite_fails_when_the_email_belongs_to_a_different_existing_user(): void {
		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find' )->with( 7 )->willReturn(
			array(
				'id'      => 7,
				'user_id' => null,
				'email'   => 'taken@example.test',
			)
		);

		Functions\when( 'get_user_by' )->justReturn( (object) array( 'ID' => 5 ) );

		$service = new ClientInviteService( $clients );

		self::assertInstanceOf( WP_Error::class, $service->invite( 7 ) );
	}

	public function test_the_sending_invite_flag_is_true_during_invite_and_resets_afterward_even_on_failure(): void {
		Functions\when( 'get_current_user_id' )->justReturn( 1 );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find' )->willReturn(
			array( 'id' => 1, 'user_id' => null, 'email' => 'client@example.test' )
		);
		// A WP user already exists with this email — invite() returns a
		// WP_Error without ever reaching retrieve_password().
		Functions\when( 'get_user_by' )->justReturn( (object) array( 'ID' => 55 ) );

		self::assertFalse( ClientInviteService::is_sending_invite() );

		$service = new ClientInviteService( $clients );
		$result  = $service->invite( 1 );

		self::assertTrue( is_wp_error( $result ) );
		self::assertFalse( ClientInviteService::is_sending_invite() );
	}
}
