<?php
/**
 * REST base for client-portal, self-service resources.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\RestApi;

use MeroDiet\Repositories\ClientRepository;
use WP_Error;

/**
 * Every resource a client's own portal touches — their plan, their
 * logs, their measurements — is scoped to their own client_id, which
 * this class resolves ONCE per request from the logged-in WP user, via
 * ClientRepository::find_for_user(). A client never supplies a
 * client_id in the request itself: there is nothing to spoof, because
 * nothing client-controllable ever reaches the repository layer as an
 * identifier. Mirrors AbstractPractitionerController's role for
 * practitioner-owned resources, but by construction rather than by a
 * per-request ownership check (see assert_owns()) — there is exactly
 * one client_id this controller can ever resolve to.
 */
abstract class AbstractClientController extends AbstractController {

	/**
	 * REST namespace shared by every client-portal resource.
	 *
	 * @var string
	 */
	protected string $namespace = 'merodiet/v1';

	/**
	 * The repository used to resolve the logged-in user to their own
	 * client row. Implemented by the concrete controller, which already
	 * holds a ClientRepository instance for its own routes (or can
	 * accept one solely for this purpose).
	 */
	abstract protected function client_repository(): ClientRepository;

	/**
	 * Resolve the current request's own internal client_id.
	 *
	 * @return int|WP_Error The client_id, or a 404-style WP_Error if the
	 *                       logged-in user has no linked client row.
	 */
	public function current_client_id(): int|WP_Error {
		$client = $this->client_repository()->find_for_user( get_current_user_id() );

		if ( null === $client ) {
			return $this->error( 'merodiet_not_found', __( 'No client record is linked to this account.', 'merodiet' ), 404 );
		}

		return (int) $client['id'];
	}
}
