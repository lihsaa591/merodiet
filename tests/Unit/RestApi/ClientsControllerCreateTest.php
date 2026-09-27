<?php
/**
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Tests\Unit\RestApi;

use Brain\Monkey\Functions;
use Nutrio\Clients\ClientInviteService;
use Nutrio\Clients\ComplianceCalculator;
use Nutrio\Email\EmailTemplateService;
use Nutrio\Email\Mailer;
use Nutrio\Repositories\ClientRepository;
use Nutrio\Repositories\LogEntryRepository;
use Nutrio\Repositories\MeasurementRepository;
use Nutrio\Repositories\PlanRepository;
use Nutrio\RestApi\ClientsController;
use Nutrio\Tests\TestCase;
use WP_REST_Request;

/**
 * Proves the "send portal invite now" option on client creation:
 * invites when asked, never invites when not asked, and — critically —
 * a failed invite attempt never undoes the just-created client record.
 *
 * ClientInviteService is `final` and can't be doubled directly (see
 * ClientsControllerComplianceTest's docblock for the same pattern) —
 * it's constructed for real here, with its own ClientRepository mock
 * controlling whether the underlying invite() call succeeds or fails.
 *
 * Mailer (and its own EmailTemplateService collaborator) are likewise
 * `final` — every test here constructs a real Mailer, stubs the
 * WordPress functions it touches (get_option/get_theme_mod/get_bloginfo),
 * and stubs wp_mail() to a no-op success rather than mocking Mailer::send()
 * directly (see MailerTest for the same pattern).
 */
final class ClientsControllerCreateTest extends TestCase {

	private function make_controller( ClientInviteService $invites ): ClientsController {
		$current_user              = $this->createMock( \WP_User::class );
		$current_user->display_name = 'Dr. Lee';
		$current_user->user_email   = 'practitioner@example.test';
		Functions\when( 'wp_get_current_user' )->justReturn( $current_user );
		Functions\when( 'get_option' )->justReturn( array() );
		Functions\when( 'get_theme_mod' )->justReturn( false );
		Functions\when( 'get_bloginfo' )->justReturn( 'Test Practice' );
		Functions\when( 'wp_mail' )->justReturn( true );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'create' )->willReturn( 7 );
		$clients->method( 'find' )->with( 7 )->willReturn(
			array(
				'id'         => 7,
				'first_name' => 'E2E',
				'last_name'  => 'Client',
				'email'      => 'client@example.test',
				'user_id'    => null,
			)
		);

		return new ClientsController(
			$clients,
			$invites,
			$this->createMock( LogEntryRepository::class ),
			$this->createMock( MeasurementRepository::class ),
			new ComplianceCalculator(
				$this->createMock( PlanRepository::class ),
				$this->createMock( LogEntryRepository::class )
			),
			new Mailer( new EmailTemplateService() )
		);
	}

	private function make_request( bool $send_invite ): WP_REST_Request {
		$request = new WP_REST_Request();
		$request->set_param( 'first_name', 'E2E' );
		$request->set_param( 'last_name', 'Client' );
		$request->set_param( 'email', 'client@example.test' );
		$request->set_param( 'send_invite', $send_invite );

		return $request;
	}

	public function test_send_invite_true_provisions_the_account(): void {
		Functions\when( 'get_current_user_id' )->justReturn( 42 );

		$invite_clients = $this->createMock( ClientRepository::class );
		$invite_clients->method( 'find' )->with( 7 )->willReturn(
			array( 'id' => 7, 'user_id' => null, 'email' => 'client@example.test' )
		);

		Functions\when( 'get_user_by' )->justReturn( false );
		Functions\when( 'wp_generate_password' )->justReturn( 'irrelevant' );
		Functions\when( 'wp_insert_user' )->justReturn( 99 );
		Functions\when( 'retrieve_password' )->justReturn( true );
		Functions\when( 'sanitize_user' )->returnArg( 1 );

		$invite_clients->expects( self::once() )->method( 'set_user_id' )->with( 7, 99 );

		$controller = $this->make_controller( new ClientInviteService( $invite_clients ) );
		$response   = $controller->create_client( $this->make_request( send_invite: true ) );

		self::assertNull( $response->get_data()['invite_error'] );
	}

	public function test_send_invite_false_never_provisions_the_account(): void {
		Functions\when( 'get_current_user_id' )->justReturn( 42 );

		$invite_clients = $this->createMock( ClientRepository::class );
		$invite_clients->expects( self::never() )->method( 'find' );
		$invite_clients->expects( self::never() )->method( 'set_user_id' );

		$controller = $this->make_controller( new ClientInviteService( $invite_clients ) );
		$response   = $controller->create_client( $this->make_request( send_invite: false ) );

		self::assertSame( 7, $response->get_data()['id'] );
		self::assertNull( $response->get_data()['invite_error'] );
	}

	public function test_a_failed_invite_does_not_undo_the_created_client(): void {
		Functions\when( 'get_current_user_id' )->justReturn( 42 );

		$invite_clients = $this->createMock( ClientRepository::class );
		$invite_clients->method( 'find' )->with( 7 )->willReturn(
			array( 'id' => 7, 'user_id' => null, 'email' => 'client@example.test' )
		);

		// A WP user already exists with this email — invite() returns a
		// WP_Error instead of provisioning an account.
		Functions\when( 'get_user_by' )->justReturn( (object) array( 'ID' => 55 ) );

		$controller = $this->make_controller( new ClientInviteService( $invite_clients ) );
		$response   = $controller->create_client( $this->make_request( send_invite: true ) );

		// The client record itself is still returned successfully — a
		// failed invite must never look like a failed client creation.
		self::assertSame( 7, $response->get_data()['id'] );
		self::assertIsString( $response->get_data()['invite_error'] );
	}

	public function test_creating_a_client_emails_the_practitioner(): void {
		Functions\when( 'get_current_user_id' )->justReturn( 42 );

		$current_user                = $this->createMock( \WP_User::class );
		$current_user->display_name = 'Dr. Lee';
		$current_user->user_email   = 'practitioner@example.test';
		Functions\when( 'wp_get_current_user' )->justReturn( $current_user );

		Functions\when( 'get_option' )->justReturn( array() );
		Functions\when( 'get_theme_mod' )->justReturn( false );
		Functions\when( 'get_bloginfo' )->justReturn( 'Test Practice' );

		// Mailer (and EmailTemplateService) are `final` and can't be
		// doubled — the send is observed by capturing wp_mail()'s
		// arguments instead of asserting on Mailer::send() directly.
		$captured = array();
		Functions\when( 'wp_mail' )->alias(
			static function ( $to, $subject, $body, $headers ) use ( &$captured ) {
				$captured = array(
					'to'      => $to,
					'subject' => $subject,
					'body'    => $body,
					'headers' => $headers,
				);

				return true;
			}
		);

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'create' )->willReturn( 7 );
		$clients->method( 'find' )->with( 7 )->willReturn(
			array( 'id' => 7, 'first_name' => 'E2E', 'last_name' => 'Client', 'email' => 'client@example.test', 'user_id' => null )
		);

		$controller = new ClientsController(
			$clients,
			new ClientInviteService( $this->createMock( ClientRepository::class ) ),
			$this->createMock( LogEntryRepository::class ),
			$this->createMock( MeasurementRepository::class ),
			new ComplianceCalculator(
				$this->createMock( PlanRepository::class ),
				$this->createMock( LogEntryRepository::class )
			),
			new Mailer( new EmailTemplateService() )
		);

		$controller->create_client( $this->make_request( send_invite: false ) );

		self::assertSame( 'practitioner@example.test', $captured['to'] );
		self::assertStringContainsString( 'E2E', $captured['subject'] );
		self::assertStringContainsString( 'Client', $captured['subject'] );
		self::assertStringContainsString( 'not invited', $captured['body'] );
	}
}
