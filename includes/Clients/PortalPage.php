<?php
/**
 * The client portal's front-end request handler.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Clients;

use MeroDiet\Email\EmailSender;
use MeroDiet\Email\Mailer;
use MeroDiet\Helper\Assets;
use MeroDiet\Repositories\ClientRepository;
use PHPMailer\PHPMailer\PHPMailer;
use WP_Error;
use WP_User;

/**
 * A full-page takeover on template_redirect, not a theme template — the
 * same "bare shell + React mount div" approach the wp-admin practitioner
 * page already uses, just reached via the front end instead of
 * wp-admin. This class never accepts a client identifier from the URL
 * or query string: the logged-in user's own linked client row (via
 * ClientRepository::find_for_user()) is the only source of identity,
 * matching the /me/* REST layer's own posture.
 */
final class PortalPage {

	private const MOUNT_ELEMENT_ID = 'merodiet-client-portal-app';
	private const SCRIPT_ENTRY     = 'client-portal';

	/**
	 * Constructor.
	 *
	 * @param ClientRepository $clients Used to resolve the logged-in user's own client row.
	 * @param Mailer           $mailer Used to render the branded invite/reset email.
	 */
	public function __construct(
		private readonly ClientRepository $clients,
		private readonly Mailer $mailer
	) {}

	/**
	 * Hooked to template_redirect. Short-circuits WordPress's normal
	 * template hierarchy whenever the portal's query var is present.
	 */
	public function handle_request(): void {
		if ( ! get_query_var( PortalRewrite::QUERY_VAR ) ) {
			return;
		}

		// This page carries personalized content (a REST nonce, the
		// client's display name) on a front-end URL — never let a page
		// cache plugin or CDN serve it to a different visitor.
		nocache_headers();
		if ( ! defined( 'DONOTCACHEPAGE' ) ) {
			define( 'DONOTCACHEPAGE', true ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- a WP-core-recognized cache-plugin convention, not our own constant to prefix.
		}

		$action = isset( $_GET['merodiet_action'] ) ? sanitize_text_field( wp_unslash( $_GET['merodiet_action'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only routing choice, not itself a state-changing action; each form below carries its own nonce.

		// A reset link is authorised by its key alone (like wp-login.php's
		// own), so it must work even when the browser already holds some
		// other session — e.g. a practitioner who just invited the client
		// and opens the email on the same machine. Without this they were
		// bounced to wp-admin instead of reaching the form.
		if ( 'resetpass' === $action ) {
			$this->handle_reset_password_request();
			exit;
		}

		if ( ! is_user_logged_in() ) {
			if ( 'lostpassword' === $action ) {
				$result = $this->maybe_process_lost_password();
				$this->render_lost_password_form( $result );
				exit;
			}

			$error = $this->maybe_process_login();
			$this->render_login_form( $error );
			exit;
		}

		if ( ! $this->current_user_is_a_linked_client( wp_get_current_user() ) ) {
			wp_safe_redirect( admin_url() );
			exit;
		}

		$this->render_app( wp_get_current_user() );
		exit;
	}

	/**
	 * The identity-resolution guard behind handle_request(): true only
	 * when the logged-in user (resolved solely from get_current_user_id()
	 * via wp_get_current_user() — never from request data) both holds the
	 * capability AND has a client row actually linked to their account
	 * (mirrors the /me/* REST layer's own check). Deliberately exit()-free
	 * so it can be unit tested directly.
	 *
	 * @param WP_User $current_user The logged-in user, as resolved from the session.
	 */
	public function current_user_is_a_linked_client( WP_User $current_user ): bool {
		if ( ! $current_user->has_cap( 'view_own_merodiet_plan' ) ) {
			return false;
		}

		return null !== $this->clients->find_for_user( $current_user->ID );
	}

	/**
	 * Sends a just-logged-in client straight to the portal instead of
	 * wp-admin's default redirect. Hooked to login_redirect. Any other
	 * role's redirect is left untouched.
	 *
	 * @param string           $redirect_to           The default redirect destination URL.
	 * @param string           $requested_redirect_to  The requested redirect destination URL, unused here.
	 * @param WP_User|WP_Error $user                   The logged-in user, or a WP_Error on a failed login.
	 */
	public function filter_login_redirect( string $redirect_to, string $requested_redirect_to, WP_User|WP_Error $user ): string { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.FoundAfterLastUsed -- required by the login_redirect filter's signature.
		if ( $user instanceof WP_Error ) {
			return $redirect_to;
		}

		if ( ! $user->has_cap( 'view_own_merodiet_plan' ) ) {
			return $redirect_to;
		}

		return PortalRewrite::url();
	}

	/**
	 * Hooked to retrieve_password_message. Only rewrites the email for a
	 * client's own reset request — a practitioner or admin resetting
	 * their wp-admin password still gets WordPress core's own message
	 * and wp-login.php link, untouched. Rebuilds the message around the
	 * same $key/$user_login WordPress core already generated, just
	 * pointing at this portal instead of wp-login.php.
	 *
	 * @param string  $message    The default message core built.
	 * @param string  $key        The reset key core generated.
	 * @param string  $user_login The user's login.
	 * @param WP_User $user_data  The user the reset is for.
	 */
	public function customize_reset_password_email( string $message, string $key, string $user_login, WP_User $user_data ): string {
		if ( ! $user_data->has_cap( 'view_own_merodiet_plan' ) ) {
			return $message;
		}

		$client = $this->clients->find_for_user( $user_data->ID );

		if ( null === $client ) {
			return $message;
		}

		add_action( 'phpmailer_init', array( self::class, 'force_html_email' ) );

		return $this->mailer->render_html(
			self::current_email_type(),
			self::email_context( $client, $key, $user_login )
		)['body'];
	}

	/**
	 * Hooked to retrieve_password_title, alongside
	 * customize_reset_password_email()'s retrieve_password_message
	 * hook — same guard, same context, just the subject half of the
	 * same email.
	 *
	 * @param string  $title      The default subject core built.
	 * @param string  $user_login The user's login.
	 * @param WP_User $user_data  The user the reset is for.
	 */
	public function customize_reset_password_subject( string $title, string $user_login, WP_User $user_data ): string {
		if ( ! $user_data->has_cap( 'view_own_merodiet_plan' ) ) {
			return $title;
		}

		$client = $this->clients->find_for_user( $user_data->ID );

		if ( null === $client ) {
			return $title;
		}

		return $this->mailer->render_html(
			self::current_email_type(),
			self::email_context( $client, '', $user_login )
		)['subject'];
	}

	/**
	 * Self-removing phpmailer_init hook — sets HTML mode directly on
	 * the PHPMailer instance right before retrieve_password()'s single
	 * wp_mail() call sends it, then unhooks itself so it never affects
	 * an unrelated later email in the same request. Stronger than
	 * filtering 'wp_mail_content_type' (a content-type string some
	 * mail-catching setups don't fully honor) — this sets the same
	 * property PHPMailer itself uses to decide HTML vs. plain text.
	 *
	 * @param PHPMailer $phpmailer The PHPMailer instance about to send.
	 */
	public static function force_html_email( PHPMailer $phpmailer ): void {
		remove_action( 'phpmailer_init', array( self::class, 'force_html_email' ) );
		$phpmailer->isHTML( true );
		EmailSender::apply_to( $phpmailer );
	}

	/**
	 * Which of the two client-facing email types this retrieve_password()
	 * call is — see ClientInviteService::is_sending_invite()'s docblock.
	 */
	private static function current_email_type(): string {
		return ClientInviteService::is_sending_invite() ? 'client_invite' : 'client_password_reset';
	}

	/**
	 * The merge-tag context both the subject and body renders need.
	 * $key is '' when called from customize_reset_password_subject()
	 * (the subject template has no {{reset_url}} tag to fill, so the
	 * unused value is harmless).
	 *
	 * @param array<string, mixed> $client     The client row (from find_for_user()).
	 * @param string               $key        The reset key core generated, or '' when building subject-only context.
	 * @param string               $user_login The user's login.
	 *
	 * @return array<string, string>
	 */
	private static function email_context( array $client, string $key, string $user_login ): array {
		$practitioner_id = (int) ( $client['practitioner_user_id'] ?? 0 );
		$practitioner    = 0 !== $practitioner_id ? get_userdata( $practitioner_id ) : false;

		$reset_url = '' !== $key
			? add_query_arg(
				array(
					'merodiet_action' => 'resetpass',
					'key'             => $key,
					'login'           => rawurlencode( $user_login ),
				),
				PortalRewrite::url()
			)
			: '';

		return array(
			'client_first_name' => (string) ( $client['first_name'] ?? '' ),
			'client_last_name'  => (string) ( $client['last_name'] ?? '' ),
			'practitioner_name' => false !== $practitioner ? $practitioner->display_name : '',
			'portal_url'        => PortalRewrite::url(),
			'reset_url'         => $reset_url,
			'site_name'         => get_bloginfo( 'name' ),
		);
	}

	/**
	 * Handles this page's own login POST directly, via wp_signon() —
	 * never wp_login_form(), which always posts to wp-login.php and
	 * would otherwise bounce a failed attempt to WordPress's own
	 * default login screen instead of back to this page. Returns null
	 * when there was no login attempt on this request (the normal
	 * "just show the form" case).
	 *
	 * @return WP_Error|null The failure, if the attempt (or its nonce) was invalid; null if there was no attempt, or on success (which redirects and exits before returning).
	 */
	private function maybe_process_login(): ?WP_Error {
		if ( ! isset( $_POST['merodiet_login_nonce'] ) ) {
			return null;
		}

		// Present only when this submission came from the [merodiet_client_portal]
		// shortcode embedded on a themed page (see render_login_card_markup()) —
		// a failed attempt bounces back there instead of rendering inline on
		// this dedicated page. wp_validate_redirect() collapses anything
		// off-site (or absent) to '', which fail_login() treats as "not embedded".
		$redirect_to = isset( $_POST['redirect_to'] ) ? wp_validate_redirect( (string) wp_unslash( $_POST['redirect_to'] ), '' ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- wp_validate_redirect() sanitizes.

		if ( ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['merodiet_login_nonce'] ) ), 'merodiet_portal_login' ) ) {
			return $this->fail_login( new WP_Error( 'invalid_nonce', __( 'Your session expired — please try again.', 'merodiet' ) ), $redirect_to );
		}

		$username = isset( $_POST['log'] ) ? sanitize_text_field( wp_unslash( $_POST['log'] ) ) : '';
		// Deliberately not sanitize_text_field()'d — a password's exact bytes
		// matter, and WordPress core's own wp-login.php passes it through
		// wp_unslash() only, the same as here.
		$password = isset( $_POST['pwd'] ) ? (string) wp_unslash( $_POST['pwd'] ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- passwords must not be altered.

		$errors = new WP_Error();

		if ( '' === trim( $username ) ) {
			$errors->add( 'empty_username', __( 'Please enter your username or email address.', 'merodiet' ) );
		}
		if ( '' === $password ) {
			$errors->add( 'empty_password', __( 'Please enter your password.', 'merodiet' ) );
		}

		if ( $errors->has_errors() ) {
			return $this->fail_login( $errors, $redirect_to );
		}

		$user = wp_signon(
			array(
				'user_login'    => $username,
				'user_password' => $password,
				'remember'      => ! empty( $_POST['rememberme'] ),
			),
			is_ssl()
		);

		if ( is_wp_error( $user ) ) {
			return $this->fail_login( $user, $redirect_to );
		}

		// Success always lands on the dedicated page, embedded or not —
		// the full app can't render inside an arbitrary theme page.
		wp_safe_redirect( PortalRewrite::url() );
		exit;
	}

	/**
	 * A failed login attempt's exit point. Embedded (redirect_to set):
	 * bounces back to the originating themed page with the error code in
	 * the query string, for render_shortcode() to read back out and
	 * display inline. Not embedded: returns the error as before, for
	 * handle_request() to pass straight to render_login_form().
	 *
	 * @param WP_Error $error       The failed attempt.
	 * @param string   $redirect_to A validated local URL to bounce back to, or '' when this request wasn't embedded.
	 */
	private function fail_login( WP_Error $error, string $redirect_to ): WP_Error {
		if ( '' === $redirect_to ) {
			return $error;
		}

		wp_safe_redirect( add_query_arg( 'merodiet_login_error', $error->get_error_code(), $redirect_to ) );
		exit;
	}

	/**
	 * Renders a styled error box for a failed login attempt —
	 * WordPress's own error codes, translated to this page's own copy
	 * rather than reusing wp-login.php's strings.
	 *
	 * @param WP_Error $error The failed attempt.
	 */
	private function render_login_errors( WP_Error $error ): void {
		$messages = array(
			'empty_username'    => __( 'Please enter your username or email address.', 'merodiet' ),
			'empty_password'    => __( 'Please enter your password.', 'merodiet' ),
			'invalid_nonce'     => __( 'Your session expired — please try again.', 'merodiet' ),
			'password_mismatch' => __( 'The two passwords you entered do not match.', 'merodiet' ),
			'expired_key'       => __( 'This password reset link has expired. Please request a new one.', 'merodiet' ),
			'invalid_key'       => __( 'This password reset link is no longer valid. Please request a new one.', 'merodiet' ),
		);

		// Any credential-mismatch code (invalid_username, incorrect_password,
		// invalid_email, ...) collapses to one generic message — deliberately
		// not confirming or denying whether the username/email exists.
		$generic = __( 'Incorrect username or password.', 'merodiet' );

		$shown = array();

		foreach ( $error->get_error_codes() as $code ) {
			$shown[] = $messages[ $code ] ?? $generic;
		}

		$shown = array_unique( $shown );
		?>
		<div class="merodiet-portal-login-error">
			<?php foreach ( $shown as $message ) : ?>
				<p><?php echo esc_html( $message ); ?></p>
			<?php endforeach; ?>
		</div>
		<?php
	}

	/**
	 * Handles this page's own "forgot password" POST directly, via
	 * retrieve_password() — the same WordPress core function
	 * ClientInviteService uses to send the initial invite, reused here
	 * so a client requesting a reset gets the identical, already-secure
	 * email flow, never wp-login.php's own lost-password screen.
	 *
	 * @return true|WP_Error|null True on a sent email, a WP_Error on failure, or null if this request wasn't a submission (just viewing the form).
	 */
	private function maybe_process_lost_password(): bool|WP_Error|null {
		if ( ! isset( $_POST['merodiet_lostpassword_nonce'] ) ) {
			return null;
		}

		if ( ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['merodiet_lostpassword_nonce'] ) ), 'merodiet_portal_lostpassword' ) ) {
			return new WP_Error( 'invalid_nonce', __( 'Your session expired — please try again.', 'merodiet' ) );
		}

		$login = isset( $_POST['user_login'] ) ? sanitize_text_field( wp_unslash( $_POST['user_login'] ) ) : '';

		if ( '' === trim( $login ) ) {
			return new WP_Error( 'empty_username', __( 'Please enter your username or email address.', 'merodiet' ) );
		}

		return retrieve_password( $login );
	}

	/**
	 * The "forgot password" form for a logged-out visitor — same
	 * card/branding as the login form, posting back to this same page.
	 *
	 * @param true|WP_Error|null $result The outcome of a just-submitted request, if any (null when just viewing the form).
	 */
	private function render_lost_password_form( bool|WP_Error|null $result ): void {
		Assets::enqueue_style( 'merodiet-portal-login', MERODIET_PATH . 'build', MERODIET_URL . 'build', 'portal-login' );
		?>
		<!DOCTYPE html>
		<html <?php language_attributes(); ?>>
		<head>
			<meta charset="<?php bloginfo( 'charset' ); ?>" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<title><?php echo esc_html( get_bloginfo( 'name' ) ); ?> — <?php esc_html_e( 'Reset Password', 'merodiet' ); ?></title>
			<?php $this->render_theme_init_script(); ?>
			<?php wp_head(); ?>
		</head>
		<body class="merodiet-portal-login">
			<main class="merodiet-portal-login-card">
				<?php $this->render_site_logo(); ?>
				<div class="merodiet-portal-login-heading">
					<h1><?php esc_html_e( 'Reset Password', 'merodiet' ); ?></h1>
					<button
						type="button"
						class="merodiet-portal-theme-toggle"
						onclick="window.merodietTogglePortalTheme()"
						aria-label="<?php esc_attr_e( 'Toggle dark mode', 'merodiet' ); ?>"
						title="<?php esc_attr_e( 'Toggle dark mode', 'merodiet' ); ?>"
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="merodiet-portal-theme-icon-sun"><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="merodiet-portal-theme-icon-moon"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" /></svg>
					</button>
				</div>
				<?php if ( true === $result ) : ?>
					<div class="merodiet-portal-login-success">
						<p><?php esc_html_e( 'Check your email for a link to reset your password.', 'merodiet' ); ?></p>
					</div>
				<?php elseif ( $result instanceof WP_Error ) : ?>
					<?php $this->render_login_errors( $result ); ?>
				<?php endif; ?>
				<?php if ( true !== $result ) : ?>
					<form name="lostpasswordform" id="loginform" method="post" action="<?php echo esc_url( add_query_arg( 'merodiet_action', 'lostpassword', PortalRewrite::url() ) ); ?>">
						<p class="login-username">
							<label for="user_login"><?php esc_html_e( 'Username or Email Address', 'merodiet' ); ?></label>
							<input type="text" name="user_login" id="user_login" class="input" value="" size="20" autocapitalize="off" autocomplete="username" />
						</p>
						<p class="login-submit">
							<?php wp_nonce_field( 'merodiet_portal_lostpassword', 'merodiet_lostpassword_nonce' ); ?>
							<input type="submit" name="wp-submit" id="wp-submit" value="<?php esc_attr_e( 'Get New Password', 'merodiet' ); ?>" />
						</p>
					</form>
				<?php endif; ?>
				<p class="merodiet-portal-login-lostpassword">
					<a href="<?php echo esc_url( PortalRewrite::url() ); ?>">
						<?php esc_html_e( '← Back to log in', 'merodiet' ); ?>
					</a>
				</p>
			</main>
			<?php wp_footer(); ?>
		</body>
		</html>
		<?php
	}

	/**
	 * Handles the "set a new password" step — reached via the link in
	 * the reset email (customize_reset_password_email() points it here
	 * instead of wp-login.php). Validates the key on every request
	 * (view AND submit — a key is short-lived and this defends against
	 * a stale form tab), then either renders the "new password" form
	 * or, on a valid submission, actually resets the password and logs
	 * the client straight into the portal.
	 */
	private function handle_reset_password_request(): void {
		$key   = isset( $_REQUEST['key'] ) ? sanitize_text_field( wp_unslash( $_REQUEST['key'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only key/login lookup; check_password_reset_key() itself is what proves this request is legitimate, not a nonce.
		$login = isset( $_REQUEST['login'] ) ? sanitize_text_field( wp_unslash( $_REQUEST['login'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- see above.

		$user = check_password_reset_key( $key, $login );

		if ( is_wp_error( $user ) ) {
			$this->render_reset_password_form( $key, $login, $user );
			return;
		}

		if ( ! isset( $_POST['merodiet_resetpass_nonce'] ) ) {
			$this->render_reset_password_form( $key, $login, null );
			return;
		}

		if ( ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['merodiet_resetpass_nonce'] ) ), 'merodiet_portal_resetpass' ) ) {
			$this->render_reset_password_form( $key, $login, new WP_Error( 'invalid_nonce', __( 'Your session expired — please try again.', 'merodiet' ) ) );
			return;
		}

		$pass1 = isset( $_POST['pass1'] ) ? (string) wp_unslash( $_POST['pass1'] ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- passwords must not be altered.
		$pass2 = isset( $_POST['pass2'] ) ? (string) wp_unslash( $_POST['pass2'] ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- passwords must not be altered.

		$errors = new WP_Error();

		if ( '' === $pass1 ) {
			$errors->add( 'empty_password', __( 'Please enter a new password.', 'merodiet' ) );
		} elseif ( $pass1 !== $pass2 ) {
			$errors->add( 'password_mismatch', __( 'The two passwords you entered do not match.', 'merodiet' ) );
		}

		if ( $errors->has_errors() ) {
			$this->render_reset_password_form( $key, $login, $errors );
			return;
		}

		reset_password( $user, $pass1 );

		wp_signon(
			array(
				'user_login'    => $user->user_login,
				'user_password' => $pass1,
				'remember'      => true,
			),
			is_ssl()
		);

		wp_safe_redirect( PortalRewrite::url() );
		exit;
	}

	/**
	 * The "set a new password" form — same card/branding as the rest of
	 * the portal's logged-out screens.
	 *
	 * @param string        $key    The reset key from the email link.
	 * @param string        $login  The user login from the email link.
	 * @param WP_Error|null $error  A failure from this same request, if any (an expired/invalid key, a validation failure, or a bad nonce).
	 */
	private function render_reset_password_form( string $key, string $login, ?WP_Error $error ): void {
		Assets::enqueue_style( 'merodiet-portal-login', MERODIET_PATH . 'build', MERODIET_URL . 'build', 'portal-login' );
		$action_url = add_query_arg(
			array(
				'merodiet_action' => 'resetpass',
				'key'             => $key,
				'login'           => rawurlencode( $login ),
			),
			PortalRewrite::url()
		);
		// An expired/invalid key means there's nothing left to submit —
		// only offer the password fields when the key itself checked out.
		$key_is_valid = null === $error || ! in_array( $error->get_error_code(), array( 'expired_key', 'invalid_key' ), true );
		?>
		<!DOCTYPE html>
		<html <?php language_attributes(); ?>>
		<head>
			<meta charset="<?php bloginfo( 'charset' ); ?>" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<title><?php echo esc_html( get_bloginfo( 'name' ) ); ?> — <?php esc_html_e( 'Reset Password', 'merodiet' ); ?></title>
			<?php $this->render_theme_init_script(); ?>
			<?php wp_head(); ?>
		</head>
		<body class="merodiet-portal-login">
			<main class="merodiet-portal-login-card">
				<?php $this->render_site_logo(); ?>
				<div class="merodiet-portal-login-heading">
					<h1><?php esc_html_e( 'Reset Password', 'merodiet' ); ?></h1>
					<button
						type="button"
						class="merodiet-portal-theme-toggle"
						onclick="window.merodietTogglePortalTheme()"
						aria-label="<?php esc_attr_e( 'Toggle dark mode', 'merodiet' ); ?>"
						title="<?php esc_attr_e( 'Toggle dark mode', 'merodiet' ); ?>"
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="merodiet-portal-theme-icon-sun"><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="merodiet-portal-theme-icon-moon"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" /></svg>
					</button>
				</div>
				<?php if ( $error instanceof WP_Error ) : ?>
					<?php $this->render_login_errors( $error ); ?>
				<?php endif; ?>
				<?php if ( $key_is_valid ) : ?>
					<form name="resetpassform" id="loginform" method="post" action="<?php echo esc_url( $action_url ); ?>">
						<p class="login-password">
							<label for="pass1"><?php esc_html_e( 'New Password', 'merodiet' ); ?></label>
							<input type="password" name="pass1" id="pass1" class="input" value="" size="20" autocomplete="new-password" />
						</p>
						<p class="login-password">
							<label for="pass2"><?php esc_html_e( 'Confirm New Password', 'merodiet' ); ?></label>
							<input type="password" name="pass2" id="pass2" class="input" value="" size="20" autocomplete="new-password" />
						</p>
						<p class="login-submit">
							<?php wp_nonce_field( 'merodiet_portal_resetpass', 'merodiet_resetpass_nonce' ); ?>
							<input type="submit" name="wp-submit" id="wp-submit" value="<?php esc_attr_e( 'Save New Password', 'merodiet' ); ?>" />
						</p>
					</form>
				<?php else : ?>
					<p class="merodiet-portal-login-lostpassword">
						<a href="<?php echo esc_url( add_query_arg( 'merodiet_action', 'lostpassword', PortalRewrite::url() ) ); ?>">
							<?php esc_html_e( 'Request a new reset link', 'merodiet' ); ?>
						</a>
					</p>
				<?php endif; ?>
				<p class="merodiet-portal-login-lostpassword">
					<a href="<?php echo esc_url( PortalRewrite::url() ); ?>">
						<?php esc_html_e( '← Back to log in', 'merodiet' ); ?>
					</a>
				</p>
			</main>
			<?php wp_footer(); ?>
		</body>
		</html>
		<?php
	}

	/**
	 * A minimal branded login form for a logged-out visitor. Posts back
	 * to this same page (never wp-login.php) — see maybe_process_login().
	 *
	 * @param WP_Error|null $error A failed attempt from this same request, if any.
	 */
	private function render_login_form( ?WP_Error $error = null ): void {
		Assets::enqueue_style( 'merodiet-portal-login', MERODIET_PATH . 'build', MERODIET_URL . 'build', 'portal-login' );
		?>
		<!DOCTYPE html>
		<html <?php language_attributes(); ?>>
		<head>
			<meta charset="<?php bloginfo( 'charset' ); ?>" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<title><?php echo esc_html( get_bloginfo( 'name' ) ); ?> — <?php esc_html_e( 'Client Portal', 'merodiet' ); ?></title>
			<?php $this->render_theme_init_script(); ?>
			<?php wp_head(); ?>
		</head>
		<body class="merodiet-portal-login">
			<?php $this->render_login_card_markup( $error ); ?>
			<?php wp_footer(); ?>
		</body>
		</html>
		<?php
	}

	/**
	 * The login card fragment — shared by this page's own full-screen
	 * render_login_form() and the [merodiet_client_portal] shortcode's
	 * embedded render_shortcode(). Never rendered standalone: always
	 * inside either that page's <body class="merodiet-portal-login"> or a
	 * themed page's content area.
	 *
	 * @param WP_Error|null $error            A failed attempt to show inline, if any.
	 * @param string        $redirect_to      When embedded, the themed page to bounce a failed attempt back to — carried as a hidden field so maybe_process_login()/fail_login() can read it back. Empty on the dedicated page itself, where a failure just re-renders in place.
	 * @param bool          $show_theme_toggle The toggle button calls window.merodietTogglePortalTheme(), only defined by render_theme_init_script() in this page's own <head> — dead on a themed page, which also already has its own light/dark story. False when embedded.
	 */
	private function render_login_card_markup( ?WP_Error $error, string $redirect_to = '', bool $show_theme_toggle = true ): void {
		?>
		<main class="merodiet-portal-login-card">
			<?php $this->render_site_logo(); ?>
			<div class="merodiet-portal-login-heading">
				<h1><?php esc_html_e( 'Client Portal', 'merodiet' ); ?></h1>
				<?php if ( $show_theme_toggle ) : ?>
					<button
						type="button"
						class="merodiet-portal-theme-toggle"
						onclick="window.merodietTogglePortalTheme()"
						aria-label="<?php esc_attr_e( 'Toggle dark mode', 'merodiet' ); ?>"
						title="<?php esc_attr_e( 'Toggle dark mode', 'merodiet' ); ?>"
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="merodiet-portal-theme-icon-sun"><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="merodiet-portal-theme-icon-moon"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" /></svg>
					</button>
				<?php endif; ?>
			</div>
			<?php if ( $error instanceof WP_Error ) : ?>
				<?php $this->render_login_errors( $error ); ?>
			<?php endif; ?>
			<form name="loginform" id="loginform" method="post" action="<?php echo esc_url( PortalRewrite::url() ); ?>">
				<?php if ( '' !== $redirect_to ) : ?>
					<input type="hidden" name="redirect_to" value="<?php echo esc_attr( $redirect_to ); ?>" />
				<?php endif; ?>
				<p class="login-username">
					<label for="user_login"><?php esc_html_e( 'Username or Email Address', 'merodiet' ); ?></label>
					<input type="text" name="log" id="user_login" class="input" value="" size="20" autocapitalize="off" autocomplete="username" />
				</p>
				<p class="login-password">
					<label for="user_pass"><?php esc_html_e( 'Password', 'merodiet' ); ?></label>
					<input type="password" name="pwd" id="user_pass" class="input" value="" size="20" autocomplete="current-password" />
				</p>
				<p class="forgetmenot">
					<input name="rememberme" type="checkbox" id="rememberme" value="forever" />
					<label for="rememberme"><?php esc_html_e( 'Remember Me', 'merodiet' ); ?></label>
				</p>
				<p class="login-submit">
					<?php wp_nonce_field( 'merodiet_portal_login', 'merodiet_login_nonce' ); ?>
					<input type="submit" name="wp-submit" id="wp-submit" value="<?php esc_attr_e( 'Log In', 'merodiet' ); ?>" />
				</p>
			</form>
			<p class="merodiet-portal-login-lostpassword">
				<a href="<?php echo esc_url( add_query_arg( 'merodiet_action', 'lostpassword', PortalRewrite::url() ) ); ?>">
					<?php esc_html_e( 'Forgot your password?', 'merodiet' ); ?>
				</a>
			</p>
		</main>
		<?php
	}

	/**
	 * [merodiet_client_portal] — embeds just the login card inside an
	 * ordinary themed page (header/footer stay intact around it); the
	 * full app still needs its own dedicated page (see class docblock —
	 * .merodiet-shell/.merodiet-rail assume a full 100vh layout an arbitrary
	 * theme's content area can't provide). The login form itself still
	 * posts to the dedicated page (see render_login_card_markup()) —
	 * this shortcode never processes a login attempt directly.
	 *
	 * A visitor already logged in as a linked client gets a link to the
	 * dedicated portal instead of a login form they don't need.
	 *
	 * @param array<string, string>|string $atts Shortcode attributes — only `theme` ("light", the default, or "dark") is recognized; anything else is ignored. Unlike the dedicated page, there's no toggle button here (see render_login_card_markup()) and no data-theme on <html> to read, so this is a fixed, author-chosen setting rather than something the visitor can flip.
	 */
	public function render_shortcode( $atts = array() ): string {
		Assets::enqueue_style( 'merodiet-portal-login', MERODIET_PATH . 'build', MERODIET_URL . 'build', 'portal-login' );

		$atts  = shortcode_atts( array( 'theme' => 'light' ), $atts, 'merodiet_client_portal' );
		$theme = 'dark' === $atts['theme'] ? 'dark' : 'light';

		if ( is_user_logged_in() && $this->current_user_is_a_linked_client( wp_get_current_user() ) ) {
			return sprintf(
				'<div class="merodiet-portal-embed" data-theme="%s"><p class="merodiet-portal-login-lostpassword"><a href="%s">%s</a></p></div>',
				esc_attr( $theme ),
				esc_url( PortalRewrite::url() ),
				esc_html__( 'You are already logged in — go to your portal →', 'merodiet' )
			);
		}

		// Set only when we just bounced back from a failed attempt (see
		// fail_login()) — the code is our own, never user-supplied free text.
		$error_code = isset( $_GET['merodiet_login_error'] ) ? sanitize_text_field( wp_unslash( $_GET['merodiet_login_error'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only display of a code this same class generated via a redirect, not a state-changing action.
		$error      = '' !== $error_code ? new WP_Error( $error_code ) : null;

		// Where a failed resubmission should bounce back to — this same
		// page, with the error code itself stripped so a retry starts clean.
		$redirect_to = remove_query_arg( 'merodiet_login_error' );

		ob_start();
		?>
		<div class="merodiet-portal-embed" data-theme="<?php echo esc_attr( $theme ); ?>">
			<?php $this->render_login_card_markup( $error, $redirect_to, false ); ?>
		</div>
		<?php
		return (string) ob_get_clean();
	}

	/**
	 * A tiny inline script, run before the stylesheet paints, that
	 * applies any previously saved theme choice as a data-theme
	 * attribute on <html> — same mechanism (and localStorage key) the
	 * practitioner admin app's own dark-mode toggle would use, so a
	 * choice made here or there is consistent. Falls back to the
	 * system preference (tokens.css's own prefers-color-scheme rules)
	 * when nothing has been saved yet. Also defines the toggle button's
	 * click handler, since this page has no React runtime to attach one.
	 */
	private function render_theme_init_script(): void {
		wp_print_inline_script_tag(
			<<<'JS'
			( function () {
				try {
					var saved = window.localStorage.getItem( 'merodiet-theme' );
					if ( 'dark' === saved || 'light' === saved ) {
						document.documentElement.setAttribute( 'data-theme', saved );
					}
				} catch ( error ) {
					// Storage unavailable (private browsing, blocked) — falls
					// back to the system preference tokens.css already handles.
				}

				window.merodietTogglePortalTheme = function () {
					var current = document.documentElement.getAttribute( 'data-theme' );
					var isDark = 'dark' === current ||
						( ! current && window.matchMedia && window.matchMedia( '(prefers-color-scheme: dark)' ).matches );
					var next = isDark ? 'light' : 'dark';
					document.documentElement.setAttribute( 'data-theme', next );
					try {
						window.localStorage.setItem( 'merodiet-theme', next );
					} catch ( error ) {
						// Storage unavailable — the choice just won't persist.
					}
				};
			} )();
JS
		);
	}

	/**
	 * Our own leaf mark plus the site's title — same branding Mailer's
	 * email header uses, deliberately not the site's own configured
	 * custom_logo (Appearance -> Customize), which could be any image a
	 * practitioner sets (often with its own baked-in white background)
	 * and isn't guaranteed to look right on this page's own card,
	 * especially in dark mode.
	 */
	private function render_site_logo(): void {
		printf(
			'<div class="merodiet-portal-login-brand"><img src="%1$s" alt="" class="merodiet-portal-login-logo" /><span class="merodiet-portal-login-brand-name">%2$s</span></div>',
			esc_url( MERODIET_URL . 'assets/images/merodiet-logo-email.png' ),
			esc_html( get_bloginfo( 'name' ) )
		);
	}

	/**
	 * The bare HTML shell + React mount div for a logged-in client.
	 *
	 * @param WP_User $current_user The logged-in client's WP user.
	 */
	private function render_app( WP_User $current_user ): void {
		$this->enqueue_assets( $current_user );

		// Lets an add-on enqueue its own script on this exact page load.
		do_action( 'merodiet_client_portal_render', $current_user );
		?>
		<!DOCTYPE html>
		<html <?php language_attributes(); ?>>
		<head>
			<meta charset="<?php bloginfo( 'charset' ); ?>" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<title><?php echo esc_html( get_bloginfo( 'name' ) ); ?> — <?php esc_html_e( 'Client Portal', 'merodiet' ); ?></title>
			<?php $this->render_theme_init_script(); ?>
			<?php wp_head(); ?>
		</head>
		<body>
			<div id="<?php echo esc_attr( self::MOUNT_ELEMENT_ID ); ?>"></div>
			<?php wp_footer(); ?>
		</body>
		</html>
		<?php
	}

	/**
	 * Enqueues the client-portal build and localizes its bootstrap data.
	 *
	 * @param WP_User $current_user The logged-in client's WP user.
	 */
	private function enqueue_assets( WP_User $current_user ): void {
		$handle = 'merodiet-' . self::SCRIPT_ENTRY;

		Assets::enqueue_script(
			$handle,
			MERODIET_PATH . 'build',
			MERODIET_URL . 'build',
			self::SCRIPT_ENTRY
		);
		wp_set_script_translations( $handle, 'merodiet', MERODIET_PATH . 'languages' );
		Assets::enqueue_style( $handle, MERODIET_PATH . 'build', MERODIET_URL . 'build', self::SCRIPT_ENTRY );

		$bootstrap_data = array(
			'restUrl'    => esc_url_raw( rest_url() ),
			'restNonce'  => wp_create_nonce( 'wp_rest' ),
			'mountId'    => self::MOUNT_ELEMENT_ID,
			'clientName' => $current_user->display_name,
			'dateFormat' => get_option( 'date_format', 'F j, Y' ),
			'logoutUrl'  => wp_logout_url( PortalRewrite::url() ),
		);

		/**
		 * Filters the client portal's localized bootstrap data — lets an
		 * add-on inject extra config for its own JS-side section.
		 *
		 * @param array<string, mixed> $bootstrap_data The default bootstrap payload.
		 * @param WP_User              $current_user   The logged-in client's WP user.
		 */
		$bootstrap_data = apply_filters( 'merodiet_client_portal_bootstrap_data', $bootstrap_data, $current_user );

		wp_localize_script( $handle, 'merodietClientPortal', $bootstrap_data );
	}
}
