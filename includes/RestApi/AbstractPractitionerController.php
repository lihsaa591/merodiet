<?php
/**
 * REST base for practitioner-owned resources.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\RestApi;

use WP_Error;
use WP_REST_Request;
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
	protected function assert_owns( ?array $fetched_row, string $owner_column = 'practitioner_user_id' ): bool|WP_Error {
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

	/**
	 * Parses and bounds-checks page/per_page from a list request — page
	 * is at least 1, per_page is clamped to 1-100 (a stray ?per_page=99999
	 * shouldn't be able to force one query to return everything).
	 *
	 * @param WP_REST_Request $request The current request.
	 *
	 * @return array{page: int, per_page: int}
	 */
	protected function pagination_args( WP_REST_Request $request ): array {
		$page     = max( 1, (int) ( $request->get_param( 'page' ) ?? 1 ) );
		$per_page = min( 100, max( 1, (int) ( $request->get_param( 'per_page' ) ?? 10 ) ) );

		return array(
			'page'     => $page,
			'per_page' => $per_page,
		);
	}

	/**
	 * Standard REST arg schema for a paginated list route — shared so
	 * every list endpoint accepts/validates page/per_page identically.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	protected static function pagination_route_args(): array {
		return array(
			'page'     => array(
				'type'    => 'integer',
				'default' => 1,
			),
			'per_page' => array(
				'type'    => 'integer',
				'default' => 10,
			),
		);
	}

	/**
	 * Parses a list request's filter params into the shape a
	 * repository's all_for_practitioner( ..., $filters ) expects —
	 * every key present, sanitized to a plain string, with an empty
	 * string for anything not supplied (QueryFilters treats '' the
	 * same as "not filtering on this"). Keeping filter-extraction here
	 * rather than repeated per-controller means adding a new filter to
	 * a list endpoint is one entry in $keys, not new parsing code.
	 *
	 * @param WP_REST_Request $request The current request.
	 * @param string[]        $keys    Filter names this endpoint supports, e.g. ['search', 'status'].
	 *
	 * @return array<string, string>
	 */
	protected function filter_args( WP_REST_Request $request, array $keys ): array {
		$filters = array();

		foreach ( $keys as $key ) {
			$filters[ $key ] = (string) ( $request->get_param( $key ) ?? '' );
		}

		return $filters;
	}

	/**
	 * Standard REST arg schema for a list route's filter params — every
	 * one a plain, optional string. Use alongside pagination_route_args()
	 * in a list route's 'args'.
	 *
	 * @param string[] $keys Filter names this endpoint supports, e.g. ['search', 'status'].
	 *
	 * @return array<string, array<string, mixed>>
	 */
	protected static function filter_route_args( array $keys ): array {
		$args = array();

		foreach ( $keys as $key ) {
			$args[ $key ] = array(
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_text_field',
			);
		}

		return $args;
	}

	/**
	 * Wraps a repository's {items, total} pagination result with the
	 * page/per_page/total_pages metadata every list response returns.
	 *
	 * @param array<int, array<string, mixed>> $items    The current page's rows.
	 * @param int                              $total    Total rows across all pages.
	 * @param int                              $page     Current page number.
	 * @param int                              $per_page Rows per page.
	 *
	 * @return array{items: array<int, array<string, mixed>>, total: int, page: int, per_page: int, total_pages: int}
	 */
	protected function paginated_response( array $items, int $total, int $page, int $per_page ): array {
		return array(
			'items'       => $items,
			'total'       => $total,
			'page'        => $page,
			'per_page'    => $per_page,
			'total_pages' => (int) max( 1, ceil( $total / $per_page ) ),
		);
	}
}
