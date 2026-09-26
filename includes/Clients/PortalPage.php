<?php
/**
 * The client portal's front-end request handler.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Clients;

use Nutrio\Helper\Assets;
use Nutrio\Repositories\ClientRepository;
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

	private const MOUNT_ELEMENT_ID = 'nutrio-client-portal-app';
	private const SCRIPT_ENTRY     = 'client-portal';

	/**
	 * Constructor.
	 *
	 * @param ClientRepository $clients Used to resolve the logged-in user's own client row.
	 */
	public function __construct( private readonly ClientRepository $clients ) {}

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

		if ( ! is_user_logged_in() ) {
			$action = isset( $_GET['nutrio_action'] ) ? sanitize_text_field( wp_unslash( $_GET['nutrio_action'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only routing choice, not itself a state-changing action; each form below carries its own nonce.

			if ( 'lostpassword' === $action ) {
				$result = $this->maybe_process_lost_password();
				$this->render_lost_password_form( $result );
				exit;
			}

			if ( 'resetpass' === $action ) {
				$this->handle_reset_password_request();
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
		if ( ! $current_user->has_cap( 'view_own_nutrio_plan' ) ) {
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

		if ( ! $user->has_cap( 'view_own_nutrio_plan' ) ) {
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
		if ( ! $user_data->has_cap( 'view_own_nutrio_plan' ) ) {
			return $message;
		}

		$reset_url = add_query_arg(
			array(
				'nutrio_action' => 'resetpass',
				'key'           => $key,
				'login'         => rawurlencode( $user_login ),
			),
			PortalRewrite::url()
		);

		return sprintf(
			/* translators: %1$s: site URL, %2$s: password reset link */
			__( "Someone has requested a password reset for the following account:\n\n%1\$s\n\nIf this was not you, you can safely ignore this email.\n\nTo reset your password, visit the following link:\n\n%2\$s", 'nutrio' ),
			home_url( '/' ),
			$reset_url
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
		if ( ! isset( $_POST['nutrio_login_nonce'] ) ) {
			return null;
		}

		if ( ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['nutrio_login_nonce'] ) ), 'nutrio_portal_login' ) ) {
			return new WP_Error( 'invalid_nonce', __( 'Your session expired — please try again.', 'nutrio' ) );
		}

		$username = isset( $_POST['log'] ) ? sanitize_text_field( wp_unslash( $_POST['log'] ) ) : '';
		// Deliberately not sanitize_text_field()'d — a password's exact bytes
		// matter, and WordPress core's own wp-login.php passes it through
		// wp_unslash() only, the same as here.
		$password = isset( $_POST['pwd'] ) ? (string) wp_unslash( $_POST['pwd'] ) : '';

		$errors = new WP_Error();

		if ( '' === trim( $username ) ) {
			$errors->add( 'empty_username', __( 'Please enter your username or email address.', 'nutrio' ) );
		}
		if ( '' === $password ) {
			$errors->add( 'empty_password', __( 'Please enter your password.', 'nutrio' ) );
		}

		if ( $errors->has_errors() ) {
			return $errors;
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
			return $user;
		}

		wp_safe_redirect( PortalRewrite::url() );
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
			'empty_username'    => __( 'Please enter your username or email address.', 'nutrio' ),
			'empty_password'    => __( 'Please enter your password.', 'nutrio' ),
			'invalid_nonce'     => __( 'Your session expired — please try again.', 'nutrio' ),
			'password_mismatch' => __( 'The two passwords you entered do not match.', 'nutrio' ),
			'expired_key'       => __( 'This password reset link has expired. Please request a new one.', 'nutrio' ),
			'invalid_key'       => __( 'This password reset link is no longer valid. Please request a new one.', 'nutrio' ),
		);

		// Any credential-mismatch code (invalid_username, incorrect_password,
		// invalid_email, ...) collapses to one generic message — deliberately
		// not confirming or denying whether the username/email exists.
		$generic = __( 'Incorrect username or password.', 'nutrio' );

		$shown = array();

		foreach ( $error->get_error_codes() as $code ) {
			$shown[] = $messages[ $code ] ?? $generic;
		}

		$shown = array_unique( $shown );
		?>
		<div class="nutrio-portal-login-error">
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
		if ( ! isset( $_POST['nutrio_lostpassword_nonce'] ) ) {
			return null;
		}

		if ( ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['nutrio_lostpassword_nonce'] ) ), 'nutrio_portal_lostpassword' ) ) {
			return new WP_Error( 'invalid_nonce', __( 'Your session expired — please try again.', 'nutrio' ) );
		}

		$login = isset( $_POST['user_login'] ) ? sanitize_text_field( wp_unslash( $_POST['user_login'] ) ) : '';

		if ( '' === trim( $login ) ) {
			return new WP_Error( 'empty_username', __( 'Please enter your username or email address.', 'nutrio' ) );
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
		Assets::enqueue_style( 'nutrio-portal-login', NUTRIO_PATH . 'build', NUTRIO_URL . 'build', 'portal-login' );
		?>
		<!DOCTYPE html>
		<html <?php language_attributes(); ?>>
		<head>
			<meta charset="<?php bloginfo( 'charset' ); ?>" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<title><?php echo esc_html( get_bloginfo( 'name' ) ); ?> — <?php esc_html_e( 'Reset Password', 'nutrio' ); ?></title>
			<?php $this->render_theme_init_script(); ?>
			<?php wp_head(); ?>
		</head>
		<body class="nutrio-portal-login">
			<main class="nutrio-portal-login-card">
				<?php $this->render_site_logo(); ?>
				<div class="nutrio-portal-login-heading">
					<h1><?php esc_html_e( 'Reset Password', 'nutrio' ); ?></h1>
					<button
						type="button"
						class="nutrio-portal-theme-toggle"
						onclick="window.nutrioTogglePortalTheme()"
						aria-label="<?php esc_attr_e( 'Toggle dark mode', 'nutrio' ); ?>"
						title="<?php esc_attr_e( 'Toggle dark mode', 'nutrio' ); ?>"
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nutrio-portal-theme-icon-sun"><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nutrio-portal-theme-icon-moon"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" /></svg>
					</button>
				</div>
				<?php if ( true === $result ) : ?>
					<div class="nutrio-portal-login-success">
						<p><?php esc_html_e( 'Check your email for a link to reset your password.', 'nutrio' ); ?></p>
					</div>
				<?php elseif ( $result instanceof WP_Error ) : ?>
					<?php $this->render_login_errors( $result ); ?>
				<?php endif; ?>
				<?php if ( true !== $result ) : ?>
					<form name="lostpasswordform" id="loginform" method="post" action="<?php echo esc_url( add_query_arg( 'nutrio_action', 'lostpassword', PortalRewrite::url() ) ); ?>">
						<p class="login-username">
							<label for="user_login"><?php esc_html_e( 'Username or Email Address', 'nutrio' ); ?></label>
							<input type="text" name="user_login" id="user_login" class="input" value="" size="20" autocapitalize="off" autocomplete="username" />
						</p>
						<p class="login-submit">
							<?php wp_nonce_field( 'nutrio_portal_lostpassword', 'nutrio_lostpassword_nonce' ); ?>
							<input type="submit" name="wp-submit" id="wp-submit" value="<?php esc_attr_e( 'Get New Password', 'nutrio' ); ?>" />
						</p>
					</form>
				<?php endif; ?>
				<p class="nutrio-portal-login-lostpassword">
					<a href="<?php echo esc_url( PortalRewrite::url() ); ?>">
						<?php esc_html_e( '← Back to log in', 'nutrio' ); ?>
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

		if ( ! isset( $_POST['nutrio_resetpass_nonce'] ) ) {
			$this->render_reset_password_form( $key, $login, null );
			return;
		}

		if ( ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['nutrio_resetpass_nonce'] ) ), 'nutrio_portal_resetpass' ) ) {
			$this->render_reset_password_form( $key, $login, new WP_Error( 'invalid_nonce', __( 'Your session expired — please try again.', 'nutrio' ) ) );
			return;
		}

		$pass1 = isset( $_POST['pass1'] ) ? (string) wp_unslash( $_POST['pass1'] ) : '';
		$pass2 = isset( $_POST['pass2'] ) ? (string) wp_unslash( $_POST['pass2'] ) : '';

		$errors = new WP_Error();

		if ( '' === $pass1 ) {
			$errors->add( 'empty_password', __( 'Please enter a new password.', 'nutrio' ) );
		} elseif ( $pass1 !== $pass2 ) {
			$errors->add( 'password_mismatch', __( 'The two passwords you entered do not match.', 'nutrio' ) );
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
		Assets::enqueue_style( 'nutrio-portal-login', NUTRIO_PATH . 'build', NUTRIO_URL . 'build', 'portal-login' );
		$action_url = add_query_arg(
			array(
				'nutrio_action' => 'resetpass',
				'key'           => $key,
				'login'         => rawurlencode( $login ),
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
			<title><?php echo esc_html( get_bloginfo( 'name' ) ); ?> — <?php esc_html_e( 'Reset Password', 'nutrio' ); ?></title>
			<?php $this->render_theme_init_script(); ?>
			<?php wp_head(); ?>
		</head>
		<body class="nutrio-portal-login">
			<main class="nutrio-portal-login-card">
				<?php $this->render_site_logo(); ?>
				<div class="nutrio-portal-login-heading">
					<h1><?php esc_html_e( 'Reset Password', 'nutrio' ); ?></h1>
					<button
						type="button"
						class="nutrio-portal-theme-toggle"
						onclick="window.nutrioTogglePortalTheme()"
						aria-label="<?php esc_attr_e( 'Toggle dark mode', 'nutrio' ); ?>"
						title="<?php esc_attr_e( 'Toggle dark mode', 'nutrio' ); ?>"
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nutrio-portal-theme-icon-sun"><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nutrio-portal-theme-icon-moon"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" /></svg>
					</button>
				</div>
				<?php if ( $error instanceof WP_Error ) : ?>
					<?php $this->render_login_errors( $error ); ?>
				<?php endif; ?>
				<?php if ( $key_is_valid ) : ?>
					<form name="resetpassform" id="loginform" method="post" action="<?php echo esc_url( $action_url ); ?>">
						<p class="login-password">
							<label for="pass1"><?php esc_html_e( 'New Password', 'nutrio' ); ?></label>
							<input type="password" name="pass1" id="pass1" class="input" value="" size="20" autocomplete="new-password" />
						</p>
						<p class="login-password">
							<label for="pass2"><?php esc_html_e( 'Confirm New Password', 'nutrio' ); ?></label>
							<input type="password" name="pass2" id="pass2" class="input" value="" size="20" autocomplete="new-password" />
						</p>
						<p class="login-submit">
							<?php wp_nonce_field( 'nutrio_portal_resetpass', 'nutrio_resetpass_nonce' ); ?>
							<input type="submit" name="wp-submit" id="wp-submit" value="<?php esc_attr_e( 'Save New Password', 'nutrio' ); ?>" />
						</p>
					</form>
				<?php else : ?>
					<p class="nutrio-portal-login-lostpassword">
						<a href="<?php echo esc_url( add_query_arg( 'nutrio_action', 'lostpassword', PortalRewrite::url() ) ); ?>">
							<?php esc_html_e( 'Request a new reset link', 'nutrio' ); ?>
						</a>
					</p>
				<?php endif; ?>
				<p class="nutrio-portal-login-lostpassword">
					<a href="<?php echo esc_url( PortalRewrite::url() ); ?>">
						<?php esc_html_e( '← Back to log in', 'nutrio' ); ?>
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
		Assets::enqueue_style( 'nutrio-portal-login', NUTRIO_PATH . 'build', NUTRIO_URL . 'build', 'portal-login' );
		?>
		<!DOCTYPE html>
		<html <?php language_attributes(); ?>>
		<head>
			<meta charset="<?php bloginfo( 'charset' ); ?>" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<title><?php echo esc_html( get_bloginfo( 'name' ) ); ?> — <?php esc_html_e( 'Client Portal', 'nutrio' ); ?></title>
			<?php $this->render_theme_init_script(); ?>
			<?php wp_head(); ?>
		</head>
		<body class="nutrio-portal-login">
			<main class="nutrio-portal-login-card">
				<?php $this->render_site_logo(); ?>
				<div class="nutrio-portal-login-heading">
					<h1><?php esc_html_e( 'Client Portal', 'nutrio' ); ?></h1>
					<button
						type="button"
						class="nutrio-portal-theme-toggle"
						onclick="window.nutrioTogglePortalTheme()"
						aria-label="<?php esc_attr_e( 'Toggle dark mode', 'nutrio' ); ?>"
						title="<?php esc_attr_e( 'Toggle dark mode', 'nutrio' ); ?>"
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nutrio-portal-theme-icon-sun"><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nutrio-portal-theme-icon-moon"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" /></svg>
					</button>
				</div>
				<?php if ( $error instanceof WP_Error ) : ?>
					<?php $this->render_login_errors( $error ); ?>
				<?php endif; ?>
				<form name="loginform" id="loginform" method="post" action="<?php echo esc_url( PortalRewrite::url() ); ?>">
					<p class="login-username">
						<label for="user_login"><?php esc_html_e( 'Username or Email Address', 'nutrio' ); ?></label>
						<input type="text" name="log" id="user_login" class="input" value="" size="20" autocapitalize="off" autocomplete="username" />
					</p>
					<p class="login-password">
						<label for="user_pass"><?php esc_html_e( 'Password', 'nutrio' ); ?></label>
						<input type="password" name="pwd" id="user_pass" class="input" value="" size="20" autocomplete="current-password" />
					</p>
					<p class="forgetmenot">
						<input name="rememberme" type="checkbox" id="rememberme" value="forever" />
						<label for="rememberme"><?php esc_html_e( 'Remember Me', 'nutrio' ); ?></label>
					</p>
					<p class="login-submit">
						<?php wp_nonce_field( 'nutrio_portal_login', 'nutrio_login_nonce' ); ?>
						<input type="submit" name="wp-submit" id="wp-submit" value="<?php esc_attr_e( 'Log In', 'nutrio' ); ?>" />
					</p>
				</form>
				<p class="nutrio-portal-login-lostpassword">
					<a href="<?php echo esc_url( add_query_arg( 'nutrio_action', 'lostpassword', PortalRewrite::url() ) ); ?>">
						<?php esc_html_e( 'Forgot your password?', 'nutrio' ); ?>
					</a>
				</p>
			</main>
			<?php wp_footer(); ?>
		</body>
		</html>
		<?php
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
		?>
		<script>
			( function () {
				try {
					var saved = window.localStorage.getItem( 'nutrio-theme' );
					if ( 'dark' === saved || 'light' === saved ) {
						document.documentElement.setAttribute( 'data-theme', saved );
					}
				} catch ( error ) {
					// Storage unavailable (private browsing, blocked) — falls
					// back to the system preference tokens.css already handles.
				}

				window.nutrioTogglePortalTheme = function () {
					var current = document.documentElement.getAttribute( 'data-theme' );
					var isDark = 'dark' === current ||
						( ! current && window.matchMedia && window.matchMedia( '(prefers-color-scheme: dark)' ).matches );
					var next = isDark ? 'light' : 'dark';
					document.documentElement.setAttribute( 'data-theme', next );
					try {
						window.localStorage.setItem( 'nutrio-theme', next );
					} catch ( error ) {
						// Storage unavailable — the choice just won't persist.
					}
				};
			} )();
		</script>
		<?php
	}

	/**
	 * Outputs the site's custom logo (Appearance -> Customize -> Site
	 * Identity), or the site icon as a fallback — read directly via the
	 * theme mod / site-icon APIs rather than get_custom_logo(), since
	 * this page never loads a theme and get_custom_logo() only works
	 * for themes that declare 'custom-logo' support. Outputs nothing if
	 * neither is set.
	 */
	private function render_site_logo(): void {
		$logo_id = get_theme_mod( 'custom_logo' );

		if ( $logo_id ) {
			echo wp_get_attachment_image(
				(int) $logo_id,
				'medium',
				false,
				array( 'class' => 'nutrio-portal-login-logo' )
			);
			return;
		}

		$icon_url = get_site_icon_url( 64 );

		if ( $icon_url ) {
			printf(
				'<img src="%s" alt="" class="nutrio-portal-login-logo" />',
				esc_url( $icon_url )
			);
		}
	}

	/**
	 * The bare HTML shell + React mount div for a logged-in client.
	 *
	 * @param WP_User $current_user The logged-in client's WP user.
	 */
	private function render_app( WP_User $current_user ): void {
		$this->enqueue_assets( $current_user );

		// Lets an add-on enqueue its own script on this exact page load.
		do_action( 'nutrio_client_portal_render', $current_user );
		?>
		<!DOCTYPE html>
		<html <?php language_attributes(); ?>>
		<head>
			<meta charset="<?php bloginfo( 'charset' ); ?>" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<title><?php echo esc_html( get_bloginfo( 'name' ) ); ?> — <?php esc_html_e( 'Client Portal', 'nutrio' ); ?></title>
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
		$handle         = 'nutrio-' . self::SCRIPT_ENTRY;
		$runtime_handle = $handle . '-runtime';

		if ( NUTRIO_DEVELOPMENT ) {
			Assets::enqueue_script( $runtime_handle, NUTRIO_PATH . 'build', NUTRIO_URL . 'build', 'runtime' );
		}

		Assets::enqueue_script(
			$handle,
			NUTRIO_PATH . 'build',
			NUTRIO_URL . 'build',
			self::SCRIPT_ENTRY,
			NUTRIO_DEVELOPMENT ? array( $runtime_handle ) : array()
		);
		wp_set_script_translations( $handle, 'nutrio', NUTRIO_PATH . 'languages' );
		Assets::enqueue_style( $handle, NUTRIO_PATH . 'build', NUTRIO_URL . 'build', self::SCRIPT_ENTRY );

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
		$bootstrap_data = apply_filters( 'nutrio_client_portal_bootstrap_data', $bootstrap_data, $current_user );

		wp_localize_script( $handle, 'nutrioClientPortal', $bootstrap_data );
	}
}
