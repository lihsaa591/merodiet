<?php
/**
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Tests\Unit\RestApi;

use Brain\Monkey\Functions;
use Nutrio\Email\EmailTemplateService;
use Nutrio\RestApi\SettingsController;
use Nutrio\Tests\TestCase;
use WP_REST_Request;

final class SettingsControllerTest extends TestCase {

	public function test_get_email_templates_lists_all_five_known_types(): void {
		Functions\when( 'get_option' )->justReturn( array() );

		$controller = new SettingsController( new EmailTemplateService() );
		$response   = $controller->get_email_templates();

		self::assertCount( 5, $response->get_data() );
	}

	public function test_update_email_template_saves_and_returns_the_new_values(): void {
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

		$request = new WP_REST_Request();
		$request->set_param( 'type', 'client_invite' );
		$request->set_param( 'subject', 'New subject' );
		$request->set_param( 'body', 'New body' );

		$controller = new SettingsController( new EmailTemplateService() );
		$response   = $controller->update_email_template( $request );

		self::assertSame( 'New subject', $response->get_data()['subject'] );
	}

	public function test_update_email_template_404s_for_an_unknown_type(): void {
		$request = new WP_REST_Request();
		$request->set_param( 'type', 'not_a_real_type' );
		$request->set_param( 'subject', 'x' );
		$request->set_param( 'body', 'y' );

		$controller = new SettingsController( new EmailTemplateService() );
		$response   = $controller->update_email_template( $request );

		self::assertSame( 404, $response->get_error_data()['status'] );
	}
}
