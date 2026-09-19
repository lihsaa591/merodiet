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

		if ( ! is_user_logged_in() ) {
			$this->render_login_form();
			exit;
		}

		$current_user = wp_get_current_user();

		if ( ! $current_user->has_cap( 'view_own_nutrio_plan' ) ) {
			wp_safe_redirect( admin_url() );
			exit;
		}

		// A capability alone isn't enough — a client row must actually be
		// linked to this user (mirrors the /me/* REST layer's own check).
		if ( null === $this->clients->find_for_user( $current_user->ID ) ) {
			wp_safe_redirect( admin_url() );
			exit;
		}

		$this->render_app( $current_user );
		exit;
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
	 * A minimal branded login form for a logged-out visitor. WordPress's
	 * own wp_login_form() handles the POST via wp-login.php — no custom
	 * auth code here.
	 */
	private function render_login_form(): void {
		?>
		<!DOCTYPE html>
		<html <?php language_attributes(); ?>>
		<head>
			<meta charset="<?php bloginfo( 'charset' ); ?>" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<title><?php echo esc_html( get_bloginfo( 'name' ) ); ?> — <?php esc_html_e( 'Client Portal', 'nutrio' ); ?></title>
		</head>
		<body class="nutrio-portal-login">
			<main class="nutrio-portal-login-card">
				<h1><?php esc_html_e( 'Client Portal', 'nutrio' ); ?></h1>
				<?php
				wp_login_form(
					array(
						'redirect' => PortalRewrite::url(),
					)
				);
				?>
			</main>
		</body>
		</html>
		<?php
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
		Assets::enqueue_style( $handle, NUTRIO_PATH . 'build', NUTRIO_URL . 'build', self::SCRIPT_ENTRY );

		$bootstrap_data = array(
			'restUrl'    => esc_url_raw( rest_url() ),
			'restNonce'  => wp_create_nonce( 'wp_rest' ),
			'mountId'    => self::MOUNT_ELEMENT_ID,
			'clientName' => $current_user->display_name,
			'dateFormat' => get_option( 'date_format', 'F j, Y' ),
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
