<?php
/**
 * Provisions a client's portal login and sends the invite.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Clients;

use Nutrio\Repositories\ClientRepository;
use WP_Error;

/**
 * Deliberately reuses WordPress core's own password-reset flow
 * (retrieve_password()) instead of a bespoke invite-token table: core
 * already owns generating, storing, expiring, and validating that
 * token securely, and every future WP core hardening of it (rate
 * limiting, expiry tuning) applies here for free. This class's only
 * job is "make sure a WP user exists for this client, linked back to
 * their row, then let core send the email."
 */
final class ClientInviteService {

	/**
	 * Constructor.
	 *
	 * @param ClientRepository $clients The client roster data access layer.
	 */
	public function __construct( private readonly ClientRepository $clients ) {}

	/**
	 * True only while invite() is on the stack — lets PortalPage's
	 * retrieve_password_message/retrieve_password_title filters tell
	 * "this retrieve_password() call is an invite" apart from "this is
	 * a genuine forgot-password request", since both currently funnel
	 * through the same WP core function. Reset in a finally block so a
	 * WP_Error partway through invite() (e.g. the email is already in
	 * use) never leaves this stuck true for the next, unrelated
	 * request in the same PHP process (relevant for a long-running
	 * wp-cli/cron context more than a normal request, but cheap to get
	 * right).
	 *
	 * @var bool
	 */
	private static bool $sending_invite = false;

	/**
	 * Whether an invite() call is currently in progress.
	 */
	public static function is_sending_invite(): bool {
		return self::$sending_invite;
	}

	/**
	 * Invite a client to the portal — creates their WP user on first
	 * call, or just resends the set-password email on any call after
	 * that (idempotent re-invite; see class docblock).
	 *
	 * @param int $client_id Internal client ID.
	 *
	 * @return bool|WP_Error Always `true` on success — declared `bool` rather
	 *                       than the standalone `true` type because this
	 *                       codebase's PHP floor (see composer.json) is 8.1,
	 *                       and standalone `true`/`false`/`null` return
	 *                       types are a PHP 8.2 addition.
	 */
	public function invite( int $client_id ): bool|WP_Error {
		self::$sending_invite = true;

		try {
			$client = $this->clients->find( $client_id );

			if ( null === $client ) {
				return new WP_Error( 'nutrio_not_found', __( 'Client not found.', 'nutrio' ), array( 'status' => 404 ) );
			}

			if ( null !== $client['user_id'] ) {
				$user = get_user_by( 'id', $client['user_id'] );

				if ( false !== $user ) {
					$result = retrieve_password( $user->user_login );

					if ( $result instanceof WP_Error ) {
						return $result;
					}

					return true;
				}
				// The linked user was deleted out-of-band — fall through and
				// re-provision a fresh one below, same as a first invite.
			}

			$existing = get_user_by( 'email', $client['email'] );

			if ( false !== $existing ) {
				return new WP_Error(
					'nutrio_email_in_use',
					__( 'A WordPress account with this email already exists. Link or resolve it manually before inviting this client.', 'nutrio' ),
					array( 'status' => 409 )
				);
			}

			$login   = sanitize_user( current( explode( '@', $client['email'] ) ) . '-' . $client_id, true );
			$user_id = wp_insert_user(
				array(
					'user_login' => $login,
					'user_email' => $client['email'],
					'user_pass'  => wp_generate_password( 32 ),
					'role'       => 'nutrition_client',
				)
			);

			if ( is_wp_error( $user_id ) ) {
				return $user_id;
			}

			$this->clients->set_user_id( $client_id, (int) $user_id );

			$user   = get_user_by( 'id', $user_id );
			$result = retrieve_password( false !== $user ? $user->user_login : $login );

			if ( $result instanceof WP_Error ) {
				return $result;
			}

			// Fires after a client is invited to the portal.
			do_action( 'nutrio_client_invited', $client_id, $user_id );

			return true;
		} finally {
			self::$sending_invite = false;
		}
	}
}
