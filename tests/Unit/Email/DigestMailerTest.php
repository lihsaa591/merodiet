<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit\Email;

use Brain\Monkey\Functions;
use MeroDiet\Email\DigestMailer;
use MeroDiet\Email\EmailTemplateService;
use MeroDiet\Email\Mailer;
use MeroDiet\Repositories\ClientRepository;
use MeroDiet\Repositories\LogEntryRepository;
use MeroDiet\Tests\TestCase;

final class DigestMailerTest extends TestCase {

	public function test_skips_a_practitioner_with_no_clients(): void {
		Functions\when( 'current_time' )->justReturn( '2026-09-27' );
		Functions\when( 'get_option' )->justReturn( array() );
		Functions\when( 'get_theme_mod' )->justReturn( false );
		Functions\when( 'get_bloginfo' )->justReturn( 'Test Practice' );

		$practitioner               = $this->createMock( \WP_User::class );
		$practitioner->ID           = 1;
		$practitioner->display_name = 'Dr. Lee';
		$practitioner->user_email   = 'lee@example.test';
		Functions\when( 'get_users' )->justReturn( array( $practitioner ) );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'all_for_practitioner' )->willReturn( array( 'items' => array(), 'total' => 0 ) );

		$sent = false;
		Functions\when( 'wp_mail' )->alias(
			static function () use ( &$sent ) {
				$sent = true;
				return true;
			}
		);

		$mailer = new Mailer( new EmailTemplateService() );
		$digest = new DigestMailer( $mailer, $clients, $this->createMock( LogEntryRepository::class ) );
		$digest->run();

		self::assertFalse( $sent );
	}

	public function test_sends_a_digest_reporting_each_client_and_escapes_client_names(): void {
		Functions\when( 'current_time' )->justReturn( '2026-09-27' );
		Functions\when( 'get_option' )->justReturn( array() );
		Functions\when( 'get_theme_mod' )->justReturn( false );
		Functions\when( 'get_bloginfo' )->justReturn( 'Test Practice' );
		Functions\when( 'esc_html' )->alias( static fn ( string $text ) => htmlspecialchars( $text, ENT_QUOTES ) );
		Functions\when( 'esc_html__' )->returnArg( 1 );

		$practitioner               = $this->createMock( \WP_User::class );
		$practitioner->ID           = 1;
		$practitioner->display_name = 'Dr. Lee';
		$practitioner->user_email   = 'lee@example.test';
		Functions\when( 'get_users' )->justReturn( array( $practitioner ) );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'all_for_practitioner' )->willReturn(
			array(
				'items' => array(
					array(
						'id'         => 1,
						'first_name' => '<script>Al</script>',
						'last_name'  => 'Lee',
					),
				),
				'total' => 1,
			)
		);

		$logs = $this->createMock( LogEntryRepository::class );
		$logs->method( 'all_for_client' )->willReturn( array( array( 'id' => 1 ) ) );

		$captured = array();
		Functions\when( 'wp_mail' )->alias(
			static function ( $to, $subject, $body, $headers ) use ( &$captured ) {
				$captured = array( $to, $subject, $body, $headers );
				return true;
			}
		);

		$mailer = new Mailer( new EmailTemplateService() );
		$digest = new DigestMailer( $mailer, $clients, $logs );
		$digest->run();

		self::assertSame( 'lee@example.test', $captured[0] );
		self::assertStringContainsString( '&lt;script&gt;Al&lt;/script&gt;', $captured[2] );
		self::assertStringNotContainsString( '<script>Al</script>', $captured[2] );
	}
}
