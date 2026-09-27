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
