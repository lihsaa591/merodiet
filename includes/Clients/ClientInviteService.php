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
	 * Invite a client to the portal — creates their WP user on first
	 * call, or just resends the set-password email on any call after
	 * that (idempotent re-invite; see class docblock).
	 *
	 * @param int $client_id Internal client ID.
	 */
	public function invite( int $client_id ): true|WP_Error {
		$client = $this->clients->find( $client_id );

		if ( null === $client ) {
			return new WP_Error( 'nutrio_not_found', __( 'Client not found.', 'nutrio' ), array( 'status' => 404 ) );
		}

		if ( null !== $client['user_id'] ) {
			$user = get_user_by( 'id', $client['user_id'] );

			if ( false !== $user ) {
				retrieve_password( $user->user_login );

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

		$user = get_user_by( 'id', $user_id );
		retrieve_password( false !== $user ? $user->user_login : $login );

		// Fires after a client is invited to the portal.
		do_action( 'nutrio_client_invited', $client_id, $user_id );

		return true;
	}
}
