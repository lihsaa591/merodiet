<?php
/**
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Tests\Unit\Clients;

use Brain\Monkey\Functions;
use Nutrio\Clients\ClientInviteService;
use Nutrio\Clients\PortalPage;
use Nutrio\Email\EmailTemplateService;
use Nutrio\Email\Mailer;
use Nutrio\Repositories\ClientRepository;
use Nutrio\Tests\TestCase;
use WP_User;

final class PortalPageTest extends TestCase {

	public function test_filter_login_redirect_sends_a_client_to_the_portal(): void {
		Functions\when( 'get_option' )->justReturn( '' );
		Functions\when( 'home_url' )->alias( static fn( string $path ) => 'https://example.test' . $path );

		$clients = $this->createMock( ClientRepository::class );
		$page    = new PortalPage( $clients, new Mailer( new EmailTemplateService() ) );

		$user = $this->createMock( WP_User::class );
		$user->method( 'has_cap' )->with( 'view_own_nutrio_plan' )->willReturn( true );

		$result = $page->filter_login_redirect( 'https://example.test/wp-admin/', '', $user );

		self::assertSame( 'https://example.test/?nutrio_portal=1', $result );
	}

	public function test_filter_login_redirect_leaves_a_practitioner_untouched(): void {
		$clients = $this->createMock( ClientRepository::class );
		$page    = new PortalPage( $clients, new Mailer( new EmailTemplateService() ) );

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

		$page = new PortalPage( $clients, new Mailer( new EmailTemplateService() ) );

		self::assertTrue( $page->current_user_is_a_linked_client( $user ) );

		unset( $_GET['client_id'] );
	}

	public function test_current_user_is_a_linked_client_is_false_when_the_user_has_the_capability_but_no_linked_client_row(): void {
		$user = $this->createMock( WP_User::class );
		$user->method( 'has_cap' )->with( 'view_own_nutrio_plan' )->willReturn( true );
		$user->ID = 42;

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_user' )->with( 42 )->willReturn( null );

		$page = new PortalPage( $clients, new Mailer( new EmailTemplateService() ) );

		self::assertFalse( $page->current_user_is_a_linked_client( $user ) );
	}

	/**
	 * [nutrio_client_portal] must never show a login form to a visitor
	 * who's already a logged-in, linked client — they'd have nothing to
	 * log in for. It links to the dedicated portal page instead.
	 */
	public function test_shortcode_shows_a_portal_link_to_an_already_logged_in_linked_client(): void {
		$this->stub_shortcode_wordpress_functions();
		Functions\when( 'is_user_logged_in' )->justReturn( true );

		$user = $this->createMock( WP_User::class );
		$user->method( 'has_cap' )->with( 'view_own_nutrio_plan' )->willReturn( true );
		$user->ID = 42;
		Functions\when( 'wp_get_current_user' )->justReturn( $user );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_user' )->with( 42 )->willReturn( array( 'id' => 7 ) );

		$page   = new PortalPage( $clients, new Mailer( new EmailTemplateService() ) );
		$output = $page->render_shortcode();

		self::assertStringContainsString( 'https://example.test/?nutrio_portal=1', $output );
		self::assertStringNotContainsString( '<form', $output );
	}

	/**
	 * A logged-out visitor (the common case) gets the login card, with a
	 * redirect_to hidden field carrying this same page's own URL so a
	 * failed attempt can bounce back here (see fail_login()).
	 */
	public function test_shortcode_shows_the_login_card_with_a_redirect_to_field_for_a_logged_out_visitor(): void {
		$this->stub_shortcode_wordpress_functions();
		Functions\when( 'is_user_logged_in' )->justReturn( false );
		Functions\when( 'remove_query_arg' )->justReturn( 'https://example.test/clients/' );

		$clients = $this->createMock( ClientRepository::class );
		$page    = new PortalPage( $clients, new Mailer( new EmailTemplateService() ) );

		$output = $page->render_shortcode();

		self::assertStringContainsString( '<form', $output );
		self::assertStringContainsString( 'name="redirect_to"', $output );
		self::assertStringContainsString( 'https://example.test/clients/', $output );
		self::assertStringContainsString( 'action="https://example.test/?nutrio_portal=1"', $output );

		// The toggle calls window.nutrioTogglePortalTheme(), which is only
		// ever defined on the dedicated page's own <head> — dead here.
		self::assertStringNotContainsString( 'nutrio-portal-theme-toggle', $output );

		// Defaults to light — there's no toggle or saved localStorage
		// choice to read here (see render_shortcode()'s own docblock).
		self::assertStringContainsString( 'data-theme="light"', $output );
	}

	/**
	 * The `theme` shortcode attribute is the only way to change the
	 * embedded card's look — there's no visitor-facing toggle.
	 */
	public function test_shortcode_theme_attribute_switches_to_dark(): void {
		$this->stub_shortcode_wordpress_functions();
		Functions\when( 'is_user_logged_in' )->justReturn( false );
		Functions\when( 'remove_query_arg' )->justReturn( 'https://example.test/clients/' );

		$clients = $this->createMock( ClientRepository::class );
		$page    = new PortalPage( $clients, new Mailer( new EmailTemplateService() ) );

		$output = $page->render_shortcode( array( 'theme' => 'dark' ) );

		self::assertStringContainsString( 'data-theme="dark"', $output );
	}

	/**
	 * A failed attempt bounced back here (see fail_login()) carries its
	 * error code in the query string — the shortcode must read it back
	 * out and show it inline, not silently drop it.
	 */
	public function test_shortcode_shows_the_bounced_back_error_from_a_failed_attempt(): void {
		$this->stub_shortcode_wordpress_functions();
		Functions\when( 'is_user_logged_in' )->justReturn( false );
		Functions\when( 'remove_query_arg' )->justReturn( 'https://example.test/clients/' );

		$_GET['nutrio_login_error'] = 'invalid_nonce';

		$clients = $this->createMock( ClientRepository::class );
		$page    = new PortalPage( $clients, new Mailer( new EmailTemplateService() ) );

		$output = $page->render_shortcode();

		unset( $_GET['nutrio_login_error'] );

		self::assertStringContainsString( 'Your session expired', $output );
	}

	public function test_customize_reset_password_email_uses_the_invite_template_while_a_client_is_being_invited(): void {
		Functions\when( 'get_option' )->justReturn( '' );
		Functions\when( 'home_url' )->alias( static fn ( string $path = '' ) => 'https://example.test' . $path );
		Functions\when( 'add_query_arg' )->alias(
			static fn ( $key, $value = '', $url = '' ) => is_array( $key ) ? ( $url ?: 'https://example.test/' ) : ( $url ?: 'https://example.test/' )
		);
		Functions\when( 'get_bloginfo' )->justReturn( 'Test Practice' );
		Functions\when( 'get_theme_mod' )->justReturn( false );
		Functions\when( 'get_userdata' )->justReturn( false );
		Functions\when( 'esc_html' )->returnArg( 1 );

		$user = $this->createMock( WP_User::class );
		$user->method( 'has_cap' )->with( 'view_own_nutrio_plan' )->willReturn( true );
		$user->ID = 42;

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_user' )->with( 42 )->willReturn(
			array( 'first_name' => 'Ana', 'last_name' => 'Lee', 'practitioner_user_id' => 7 )
		);

		$templates = new EmailTemplateService();
		$mailer    = new Mailer( $templates );
		$page      = new PortalPage( $clients, $mailer );

		ClientInviteServiceTestHelper::force_sending_invite( true );
		try {
			$result = $page->customize_reset_password_email( 'original core message', 'key123', 'ana', $user );
		} finally {
			ClientInviteServiceTestHelper::force_sending_invite( false );
		}

		self::assertStringContainsString( 'invited', $result );
	}

	/**
	 * Same setup as the invite test above, but with the static flag left
	 * false (a genuine "forgot my password" request, not an invite) —
	 * confirms the two email types actually render differently, not
	 * just that customize_reset_password_email() returns *something*.
	 */
	public function test_customize_reset_password_email_uses_the_reset_template_when_not_sending_an_invite(): void {
		Functions\when( 'get_option' )->justReturn( '' );
		Functions\when( 'home_url' )->alias( static fn ( string $path = '' ) => 'https://example.test' . $path );
		Functions\when( 'add_query_arg' )->alias(
			static fn ( $key, $value = '', $url = '' ) => is_array( $key ) ? ( $url ?: 'https://example.test/' ) : ( $url ?: 'https://example.test/' )
		);
		Functions\when( 'get_bloginfo' )->justReturn( 'Test Practice' );
		Functions\when( 'get_theme_mod' )->justReturn( false );
		Functions\when( 'get_userdata' )->justReturn( false );
		Functions\when( 'esc_html' )->returnArg( 1 );

		$user = $this->createMock( WP_User::class );
		$user->method( 'has_cap' )->with( 'view_own_nutrio_plan' )->willReturn( true );
		$user->ID = 42;

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_user' )->with( 42 )->willReturn(
			array( 'first_name' => 'Ana', 'last_name' => 'Lee', 'practitioner_user_id' => 7 )
		);

		$templates = new EmailTemplateService();
		$mailer    = new Mailer( $templates );
		$page      = new PortalPage( $clients, $mailer );

		ClientInviteServiceTestHelper::force_sending_invite( false );
		$result = $page->customize_reset_password_email( 'original core message', 'key123', 'ana', $user );

		self::assertStringNotContainsString( 'invited', $result );
		self::assertStringContainsString( 'Reset your password', $result );
	}

	/**
	 * The subject half of the same email, exercised directly — until now
	 * only the body method (customize_reset_password_email()) had a
	 * direct test.
	 */
	public function test_customize_reset_password_subject_uses_the_reset_template_subject(): void {
		Functions\when( 'get_option' )->justReturn( '' );
		Functions\when( 'home_url' )->alias( static fn ( string $path = '' ) => 'https://example.test' . $path );
		Functions\when( 'add_query_arg' )->alias(
			static fn ( $key, $value = '', $url = '' ) => is_array( $key ) ? ( $url ?: 'https://example.test/' ) : ( $url ?: 'https://example.test/' )
		);
		Functions\when( 'get_bloginfo' )->justReturn( 'Test Practice' );
		Functions\when( 'get_theme_mod' )->justReturn( false );
		Functions\when( 'get_userdata' )->justReturn( false );
		Functions\when( 'esc_html' )->returnArg( 1 );

		$user = $this->createMock( WP_User::class );
		$user->method( 'has_cap' )->with( 'view_own_nutrio_plan' )->willReturn( true );
		$user->ID = 42;

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_user' )->with( 42 )->willReturn(
			array( 'first_name' => 'Ana', 'last_name' => 'Lee', 'practitioner_user_id' => 7 )
		);

		$templates = new EmailTemplateService();
		$mailer    = new Mailer( $templates );
		$page      = new PortalPage( $clients, $mailer );

		ClientInviteServiceTestHelper::force_sending_invite( false );
		$result = $page->customize_reset_password_subject( 'original core title', 'ana', $user );

		self::assertSame( 'Reset your client portal password', $result );
	}

	/**
	 * Both customize_reset_password_email() and
	 * customize_reset_password_subject() must leave WordPress core's own
	 * message/title completely untouched whenever the user has the
	 * capability but no client row is actually linked to their account
	 * (find_for_user() returns null) — this is the same "capable but
	 * unlinked" case current_user_is_a_linked_client() already guards
	 * elsewhere in this class.
	 */
	public function test_customize_reset_password_email_and_subject_are_untouched_when_the_user_has_no_linked_client_row(): void {
		$user = $this->createMock( WP_User::class );
		$user->method( 'has_cap' )->with( 'view_own_nutrio_plan' )->willReturn( true );
		$user->ID = 42;

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_user' )->with( 42 )->willReturn( null );

		$templates = new EmailTemplateService();
		$mailer    = new Mailer( $templates );
		$page      = new PortalPage( $clients, $mailer );

		self::assertSame(
			'original core message',
			$page->customize_reset_password_email( 'original core message', 'key123', 'ana', $user )
		);
		self::assertSame(
			'original core title',
			$page->customize_reset_password_subject( 'original core title', 'ana', $user )
		);
	}

	/**
	 * force_html_email() is a public static method precisely so it can
	 * be called directly here, without going through a full
	 * customize_reset_password_email() render — it must both set HTML
	 * mode on the PHPMailer instance it's handed AND remove the exact
	 * same phpmailer_init action it was added as, so it never leaks
	 * into an unrelated later email in the same request.
	 */
	public function test_force_html_email_sets_html_mode_and_removes_its_own_action_after_firing(): void {
		add_action( 'phpmailer_init', array( PortalPage::class, 'force_html_email' ) );

		self::assertNotFalse(
			has_action( 'phpmailer_init', array( PortalPage::class, 'force_html_email' ) ),
			'Precondition: the action must actually be registered before force_html_email() runs.'
		);

		$phpmailer = new \PHPMailer\PHPMailer\PHPMailer();
		PortalPage::force_html_email( $phpmailer );

		self::assertTrue( $phpmailer->is_html );
		self::assertFalse(
			has_action( 'phpmailer_init', array( PortalPage::class, 'force_html_email' ) ),
			'force_html_email() must remove_action() itself so it never affects an unrelated later email.'
		);
	}

	/**
	 * WordPress functions render_login_card_markup()/render_shortcode()
	 * touch beyond the i18n/escaping helpers TestCase already stubs.
	 */
	private function stub_shortcode_wordpress_functions(): void {
		Functions\when( 'wp_enqueue_style' )->justReturn( null );
		Functions\when( 'wp_style_add_data' )->justReturn( true );
		Functions\when( 'get_option' )->justReturn( '' );
		Functions\when( 'home_url' )->alias( static fn( string $path = '' ) => 'https://example.test' . $path );
		Functions\when( 'get_theme_mod' )->justReturn( false );
		Functions\when( 'get_site_icon_url' )->justReturn( '' );
		Functions\when( 'get_bloginfo' )->justReturn( 'Test Practice' );
		Functions\when( 'esc_html_e' )->alias(
			static function ( string $text ) {
				echo $text; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- test stub.
			}
		);
		Functions\when( 'esc_attr_e' )->alias(
			static function ( string $text ) {
				echo $text; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- test stub.
			}
		);
		Functions\when( 'wp_nonce_field' )->justReturn( '' );
		Functions\when( 'add_query_arg' )->alias(
			static fn( $key, $value = '', $url = '' ) => is_array( $key ) ? ( $value ?: 'https://example.test/' ) : ( $url ?: 'https://example.test/' )
		);
		Functions\when( 'wp_unslash' )->returnArg( 1 );
		Functions\when( 'shortcode_atts' )->alias(
			static fn( array $pairs, $atts ) => array_merge( $pairs, is_array( $atts ) ? $atts : array() )
		);
	}
}
