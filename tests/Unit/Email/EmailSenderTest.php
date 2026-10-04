<?php
/**
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Tests\Unit\Email;

use Brain\Monkey\Functions;
use Nutrio\Email\EmailSender;
use Nutrio\Tests\TestCase;
use PHPMailer\PHPMailer\PHPMailer;

final class EmailSenderTest extends TestCase {

	private function saved( string $name, string $address ): void {
		Functions\when( 'get_option' )->justReturn(
			array(
				'from_name'    => $name,
				'from_address' => $address,
			)
		);
		Functions\when( 'network_home_url' )->justReturn( 'https://www.example.test/' );
		Functions\when( 'wp_parse_url' )->alias( 'parse_url' );
	}

	public function test_nothing_saved_means_no_override(): void {
		Functions\when( 'get_option' )->justReturn( array() );

		self::assertNull( EmailSender::resolve() );
		self::assertNull( EmailSender::header() );
	}

	public function test_header_includes_quoted_name_and_address(): void {
		$this->saved( 'Dr. "Ana", RD', 'ana@example.test' );

		self::assertSame( 'From: "Dr. \"Ana\", RD" <ana@example.test>', EmailSender::header() );
	}

	public function test_address_only_sends_a_bare_from_header(): void {
		$this->saved( '', 'ana@example.test' );

		self::assertSame( 'From: ana@example.test', EmailSender::header() );
	}

	public function test_name_only_borrows_the_wordpress_default_address(): void {
		$this->saved( 'Ana', '' );

		self::assertSame( 'From: "Ana" <wordpress@example.test>', EmailSender::header() );
	}

	public function test_defaults_strip_www_from_the_host(): void {
		$this->saved( '', '' );

		self::assertSame(
			array(
				'from_name'    => 'WordPress',
				'from_address' => 'wordpress@example.test',
			),
			EmailSender::defaults()
		);
	}

	public function test_address_validation_allows_empty_and_rejects_garbage(): void {
		Functions\when( 'is_email' )->alias(
			static fn ( string $value ) => false !== filter_var( $value, FILTER_VALIDATE_EMAIL ) ? $value : false
		);

		self::assertTrue( EmailSender::is_valid_address( '' ) );
		self::assertTrue( EmailSender::is_valid_address( 'ana@example.test' ) );
		self::assertFalse( EmailSender::is_valid_address( 'not-an-email' ) );
	}

	public function test_apply_to_sets_the_phpmailer_from(): void {
		$this->saved( 'Ana', 'ana@example.test' );

		$phpmailer = new PHPMailer();
		EmailSender::apply_to( $phpmailer );

		self::assertSame( 'ana@example.test', $phpmailer->From );
		self::assertSame( 'Ana', $phpmailer->FromName );
	}

	public function test_apply_to_leaves_phpmailer_alone_when_nothing_is_saved(): void {
		Functions\when( 'get_option' )->justReturn( array() );

		$phpmailer = new PHPMailer();
		$before    = $phpmailer->From;
		EmailSender::apply_to( $phpmailer );

		self::assertSame( $before, $phpmailer->From );
	}

	public function test_save_sanitizes_and_stores_the_values(): void {
		$stored = null;
		Functions\when( 'sanitize_text_field' )->returnArg( 1 );
		Functions\when( 'sanitize_email' )->returnArg( 1 );
		Functions\when( 'add_option' )->justReturn( true );
		Functions\when( 'update_option' )->alias(
			static function ( string $name, $value ) use ( &$stored ) {
				$stored = array( $name, $value );
				return true;
			}
		);

		EmailSender::save( 'Ana', 'ana@example.test' );

		self::assertSame(
			array(
				'nutrio_email_sender',
				array(
					'from_name'    => 'Ana',
					'from_address' => 'ana@example.test',
				),
			),
			$stored
		);
	}
}
