<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit\Email;

use Brain\Monkey\Functions;
use MeroDiet\Email\EmailTemplateService;
use MeroDiet\Email\Mailer;
use MeroDiet\Tests\TestCase;

final class MailerTest extends TestCase {

	public function test_render_html_wraps_the_rendered_body_with_the_site_name(): void {
		Functions\when( 'get_option' )->justReturn( array() );
		Functions\when( 'get_theme_mod' )->justReturn( false );
		Functions\when( 'get_bloginfo' )->justReturn( 'Test Practice' );

		$mailer = new Mailer( new EmailTemplateService() );
		$result = $mailer->render_html( 'client_invite', array( 'client_first_name' => 'Ana' ) );

		self::assertStringContainsString( 'Test Practice', $result['body'] );
		self::assertStringContainsString( 'Ana', $result['body'] );
	}

	public function test_send_calls_wp_mail_with_html_content_type(): void {
		Functions\when( 'get_option' )->justReturn( array() );
		Functions\when( 'get_theme_mod' )->justReturn( false );
		Functions\when( 'get_bloginfo' )->justReturn( 'Test Practice' );

		$captured = array();
		Functions\when( 'wp_mail' )->alias(
			static function ( $to, $subject, $body, $headers ) use ( &$captured ) {
				$captured = array( $to, $subject, $body, $headers );
				return true;
			}
		);

		$mailer = new Mailer( new EmailTemplateService() );
		$result = $mailer->send( 'client_invite', 'client@example.test', array( 'client_first_name' => 'Ana' ) );

		self::assertTrue( $result );
		self::assertSame( 'client@example.test', $captured[0] );
		self::assertContains( 'Content-Type: text/html; charset=UTF-8', $captured[3] );
	}

	public function test_send_adds_the_configured_from_header(): void {
		Functions\when( 'get_option' )->justReturn(
			array(
				'from_name'    => 'Ana Practice',
				'from_address' => 'hello@example.test',
			)
		);
		Functions\when( 'get_theme_mod' )->justReturn( false );
		Functions\when( 'get_bloginfo' )->justReturn( 'Test Practice' );

		$headers = array();
		Functions\when( 'wp_mail' )->alias(
			static function ( $to, $subject, $body, $sent_headers ) use ( &$headers ) {
				$headers = $sent_headers;
				return true;
			}
		);

		( new Mailer( new EmailTemplateService() ) )->send( 'client_invite', 'client@example.test', array() );

		self::assertContains( 'From: "Ana Practice" <hello@example.test>', $headers );
	}

	public function test_send_skips_a_disabled_type_without_calling_wp_mail(): void {
		Functions\when( 'get_option' )->justReturn( array( 'enabled' => false ) );

		$called = false;
		Functions\when( 'wp_mail' )->alias(
			static function () use ( &$called ) {
				$called = true;
				return true;
			}
		);

		$mailer = new Mailer( new EmailTemplateService() );
		$result = $mailer->send( 'client_plan_assigned', 'client@example.test', array() );

		self::assertFalse( $result );
		self::assertFalse( $called );
	}
}
