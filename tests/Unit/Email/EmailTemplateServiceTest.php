<?php
/**
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Tests\Unit\Email;

use Brain\Monkey\Functions;
use InvalidArgumentException;
use Nutrio\Email\EmailTemplateService;
use Nutrio\Email\RawHtml;
use Nutrio\Tests\TestCase;

final class EmailTemplateServiceTest extends TestCase {

	public function test_get_falls_back_to_the_registry_default_when_nothing_is_saved(): void {
		Functions\when( 'get_option' )->justReturn( array() );

		$service = new EmailTemplateService();
		$result  = $service->get( 'client_invite' );

		self::assertStringContainsString( 'invited', $result['subject'] );
	}

	public function test_save_then_get_round_trips_through_the_option(): void {
		$stored = null;

		Functions\when( 'add_option' )->justReturn( true );
		Functions\when( 'sanitize_text_field' )->returnArg( 1 );
		Functions\when( 'wp_kses_post' )->returnArg( 1 );
		Functions\when( 'update_option' )->alias(
			static function ( string $name, $value ) use ( &$stored ) {
				$stored = $value;
				return true;
			}
		);
		Functions\when( 'get_option' )->alias(
			static function ( string $name, $default = false ) use ( &$stored ) {
				return $stored ?? $default;
			}
		);

		$service = new EmailTemplateService();
		$service->save( 'client_invite', 'Custom subject', 'Custom body' );

		$result = $service->get( 'client_invite' );

		self::assertSame( 'Custom subject', $result['subject'] );
		self::assertSame( 'Custom body', $result['body'] );
	}

	public function test_save_rejects_an_unknown_type(): void {
		$this->expectException( InvalidArgumentException::class );

		( new EmailTemplateService() )->save( 'not_a_real_type', 'x', 'y' );
	}

	public function test_get_defaults_enabled_to_true_when_nothing_is_saved(): void {
		Functions\when( 'get_option' )->justReturn( array() );

		$result = ( new EmailTemplateService() )->get( 'client_plan_assigned' );

		self::assertTrue( $result['enabled'] );
	}

	public function test_set_enabled_persists_and_never_touches_subject_or_body(): void {
		$stored = array(
			'subject' => 'Existing subject',
			'body'    => 'Existing body',
			'enabled' => true,
		);

		Functions\when( 'add_option' )->justReturn( true );
		Functions\when( 'update_option' )->alias(
			static function ( string $name, $value ) use ( &$stored ) {
				$stored = $value;
				return true;
			}
		);
		Functions\when( 'get_option' )->alias(
			static function ( string $name, $default = false ) use ( &$stored ) {
				return $stored ?? $default;
			}
		);

		$service = new EmailTemplateService();
		$service->set_enabled( 'client_plan_assigned', false );

		$result = $service->get( 'client_plan_assigned' );

		self::assertFalse( $result['enabled'] );
		self::assertSame( 'Existing subject', $result['subject'] );
		self::assertSame( 'Existing body', $result['body'] );
	}

	public function test_save_preserves_the_current_enabled_state(): void {
		$stored = array(
			'subject' => 'x',
			'body'    => 'y',
			'enabled' => false,
		);

		Functions\when( 'add_option' )->justReturn( true );
		Functions\when( 'sanitize_text_field' )->returnArg( 1 );
		Functions\when( 'wp_kses_post' )->returnArg( 1 );
		Functions\when( 'update_option' )->alias(
			static function ( string $name, $value ) use ( &$stored ) {
				$stored = $value;
				return true;
			}
		);
		Functions\when( 'get_option' )->alias(
			static function ( string $name, $default = false ) use ( &$stored ) {
				return $stored ?? $default;
			}
		);

		$service = new EmailTemplateService();
		$service->save( 'client_plan_assigned', 'New subject', 'New body' );

		self::assertFalse( $service->get( 'client_plan_assigned' )['enabled'] );
	}

	public function test_set_enabled_rejects_an_unknown_type(): void {
		$this->expectException( InvalidArgumentException::class );

		( new EmailTemplateService() )->set_enabled( 'not_a_real_type', false );
	}

	public function test_render_substitutes_tags_and_escapes_plain_string_context_values(): void {
		Functions\when( 'get_option' )->justReturn( array() );
		Functions\when( 'esc_html' )->alias( static fn ( string $text ) => htmlspecialchars( $text, ENT_QUOTES ) );

		$service = new EmailTemplateService();
		$result  = $service->render(
			'client_invite',
			array(
				'client_first_name' => '<b>Al</b>',
				'practitioner_name' => 'Dr. Lee',
				'portal_url'        => 'https://example.test/portal',
				'site_name'         => 'Test Site',
				'client_last_name'  => '',
			)
		);

		self::assertStringContainsString( '&lt;b&gt;Al&lt;/b&gt;', $result['body'] );
		self::assertStringNotContainsString( '<b>Al</b>', $result['body'] );
	}

	public function test_render_does_not_escape_the_subject_but_still_escapes_the_body(): void {
		// The default client_invite subject has no {{client_first_name}}
		// tag, so a saved override is used here to put it in the subject too.
		Functions\when( 'get_option' )->justReturn(
			array(
				'subject' => 'New client added: {{client_first_name}}',
				'body'    => 'Hi {{client_first_name}},',
			)
		);
		Functions\when( 'esc_html' )->alias( static fn ( string $text ) => htmlspecialchars( $text, ENT_QUOTES ) );

		$service = new EmailTemplateService();
		$result  = $service->render(
			'client_invite',
			array(
				'client_first_name' => "O'Brien",
				'practitioner_name' => 'Dr. Lee',
				'portal_url'        => 'https://example.test/portal',
				'site_name'         => 'Test Site',
				'client_last_name'  => '',
			)
		);

		self::assertStringContainsString( "O'Brien", $result['subject'] );
		self::assertStringNotContainsString( '&#039;', $result['subject'] );

		self::assertStringContainsString( '&#039;', $result['body'] );
		self::assertStringNotContainsString( "O'Brien", $result['body'] );
	}

	public function test_render_leaves_a_rawhtml_context_value_unescaped(): void {
		Functions\when( 'get_option' )->justReturn( array() );
		Functions\when( 'esc_html' )->alias( static fn ( string $text ) => htmlspecialchars( $text, ENT_QUOTES ) );

		$service = new EmailTemplateService();
		$result  = $service->render(
			'practitioner_daily_digest',
			array(
				'practitioner_name' => 'Dr. Lee',
				'report_date'       => '2026-09-27',
				'report_table'      => new RawHtml( '<table><tr><td>Ana</td></tr></table>' ),
			)
		);

		self::assertStringContainsString( '<table><tr><td>Ana</td></tr></table>', $result['body'] );
	}
}
