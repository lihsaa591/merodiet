<?php
/**
 * REST base for practitioner-owned resources.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\RestApi;

use WP_Error;
// AbstractController lives in this same namespace (Nutrio\RestApi) —
// no use import needed.

/**
 * Every resource a practitioner manages here — clients, recipes, plans
 * — is scoped to that practitioner. A WordPress capability
 * ('manage_nutrio_clients' etc., checked by the parent class) only
 * proves *a* practitioner is logged in; it says nothing about whether
 * *this* row belongs to *them*. That row-level check is what this
 * class adds, in one place, so it can't be forgotten in one controller
 * while present in another.
 */
abstract class AbstractPractitionerController extends AbstractController {

	/**
	 * REST namespace shared by every practitioner-owned resource.
	 *
	 * @var string
	 */
	protected string $namespace = 'nutrio/v1';

	/**
	 * The current request's user ID. Named for what it means in this
	 * domain, not what WordPress calls it — every route here already
	 * required the 'manage_nutrio_*' capability, so by the time this is
	 * called the current user is known to be a practitioner.
	 */
	protected function current_practitioner_id(): int {
		return get_current_user_id();
	}

	/**
	 * Verify a fetched resource actually belongs to the current
	 * practitioner. Call this after every single-resource fetch
	 * (find-by-id) before returning or mutating it.
	 *
	 * @param array<string, mixed>|null $fetched_row  The fetched row, or null if it didn't exist at all.
	 * @param string                    $owner_column Column holding the owning practitioner's user ID.
	 */
	protected function assert_owns( ?array $fetched_row, string $owner_column = 'practitioner_user_id' ): true|WP_Error {
		if ( null === $fetched_row ) {
			return $this->error( 'nutrio_not_found', __( 'Resource not found.', 'nutrio' ), 404 );
		}

		if ( (int) $fetched_row[ $owner_column ] !== $this->current_practitioner_id() ) {
			// Deliberately the same 404 as "doesn't exist" rather than a
			// 403 — a 403 confirms the ID belongs to *someone*, leaking
			// that another practitioner's resource exists at all.
			return $this->error( 'nutrio_not_found', __( 'Resource not found.', 'nutrio' ), 404 );
		}

		return true;
	}
}
