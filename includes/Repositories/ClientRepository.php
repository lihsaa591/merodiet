<?php
/**
 * Client roster data access.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Repositories;

use Nutrio\Database\QueryFilters;

/**
 * Every read method here takes the requesting practitioner's user ID
 * and scopes the query to it — defense in depth alongside
 * AbstractPractitionerController::assert_owns(): even if a controller
 * forgot the ownership check, these queries physically cannot return
 * another practitioner's row.
 */
class ClientRepository {

	/**
	 * Insert a new client, owned by the given practitioner.
	 *
	 * @param int                                                                                                                                        $practitioner_user_id Owning practitioner's user ID.
	 * @param array{first_name:string, last_name:string, email:string, goals?:string, dietary_restrictions?:string, allergies?:string[], status?:string} $data                  Client fields.
	 *
	 * @return int The new client's internal ID.
	 */
	public function create( int $practitioner_user_id, array $data ): int {
		global $wpdb;

		// Lets an add-on (e.g. a pro client-cap limit) adjust or reject data before insert.
		$data = apply_filters( 'nutrio_client_before_create', $data, $practitioner_user_id );

		$now = current_time( 'mysql' );

		$wpdb->insert(
			$wpdb->prefix . 'nutrio_clients',
			array(
				'practitioner_user_id' => $practitioner_user_id,
				'first_name'           => $data['first_name'],
				'last_name'            => $data['last_name'],
				'email'                => $data['email'],
				'goals'                => $data['goals'] ?? null,
				'dietary_restrictions' => $data['dietary_restrictions'] ?? null,
				'allergies'            => wp_json_encode( $data['allergies'] ?? array() ),
				'status'               => $data['status'] ?? 'active',
				'created_at'           => $now,
				'updated_at'           => $now,
			)
		);

		$id = (int) $wpdb->insert_id;

		// Fires after a client is created.
		do_action( 'nutrio_client_created', $id, $data, $practitioner_user_id );

		return $id;
	}

	/**
	 * Find a client by ID, regardless of owner — callers MUST verify
	 * ownership themselves (see AbstractPractitionerController) before
	 * exposing or mutating the result. Prefer find_for_practitioner()
	 * wherever the caller already knows which practitioner is asking.
	 *
	 * @param int $id Internal client ID.
	 *
	 * @return array<string, mixed>|null
	 */
	public function find( int $id ): ?array {
		global $wpdb;

		$row = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}nutrio_clients WHERE id = %d", $id ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input; value is parameterized.
			ARRAY_A
		);

		return null === $row ? null : $this->hydrate( $row );
	}

	/**
	 * Find a client by ID, scoped to the given practitioner — returns
	 * null both when the ID doesn't exist and when it belongs to
	 * someone else, which is exactly the ambiguity
	 * AbstractPractitionerController::assert_owns() wants (see its
	 * docblock on why that's a deliberate 404-either-way).
	 *
	 * @param int $id                    Internal client ID.
	 * @param int $practitioner_user_id  Practitioner the client must belong to.
	 *
	 * @return array<string, mixed>|null
	 */
	public function find_for_practitioner( int $id, int $practitioner_user_id ): ?array {
		global $wpdb;

		$row = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$wpdb->prefix}nutrio_clients WHERE id = %d AND practitioner_user_id = %d", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input; values are parameterized.
				$id,
				$practitioner_user_id
			),
			ARRAY_A
		);

		return null === $row ? null : $this->hydrate( $row );
	}

	/**
	 * Find the client row linked to a given WordPress user — the lookup
	 * every client-portal request starts from (see
	 * AbstractClientController::current_client_id()). Returns null both
	 * when no client is linked to this user and when the user doesn't
	 * exist, which is the same "don't leak which case it is" posture
	 * find_for_practitioner() takes for practitioner-owned rows.
	 *
	 * @param int $user_id WordPress user ID of the logged-in client.
	 *
	 * @return array<string, mixed>|null
	 */
	public function find_for_user( int $user_id ): ?array {
		global $wpdb;

		$row = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}nutrio_clients WHERE user_id = %d", $user_id ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input; value is parameterized.
			ARRAY_A
		);

		return null === $row ? null : $this->hydrate( $row );
	}

	/**
	 * Link a client row to the WordPress user created for its portal
	 * login — see ClientInviteService, the only caller.
	 *
	 * @param int $client_id Internal client ID.
	 * @param int $user_id   WordPress user ID to link.
	 */
	public function set_user_id( int $client_id, int $user_id ): void {
		global $wpdb;

		$wpdb->update(
			$wpdb->prefix . 'nutrio_clients',
			array(
				'user_id'    => $user_id,
				'updated_at' => current_time( 'mysql' ),
			),
			array( 'id' => $client_id )
		);
	}

	/**
	 * A page of clients belonging to a practitioner, alphabetical by name,
	 * plus the total count across all pages (for building pagination UI
	 * without a second round-trip). $filters is deliberately open-ended —
	 * see QueryFilters — today supports 'search' (name/email) and 'status'
	 * (exact match); a future filter is one more QueryFilters call here,
	 * not a signature change.
	 *
	 * @param int                   $practitioner_user_id Owning practitioner's user ID.
	 * @param int                   $page                 1-indexed page number.
	 * @param int                   $per_page             Rows per page.
	 * @param array<string, string> $filters              Optional filters — 'search', 'status'.
	 *
	 * @return array{items: array<int, array<string, mixed>>, total: int}
	 */
	public function all_for_practitioner( int $practitioner_user_id, int $page = 1, int $per_page = 10, array $filters = array() ): array {
		global $wpdb;

		$table = $wpdb->prefix . 'nutrio_clients';

		$params = array( $practitioner_user_id );

		$where = QueryFilters::combine(
			'practitioner_user_id = %d',
			array(
				QueryFilters::search_clause( $filters, 'search', array( 'first_name', 'last_name', 'email' ), $params ),
				QueryFilters::exact_clause( $filters, 'status', 'status', $params ),
			)
		);

		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders -- table name and WHERE clause are built from fixed strings and caller-supplied literals, not user input; every value is bound via prepare()'s own placeholders. phpcs's static count of "%s"/"%d" tokens can't see through the ...$params spread, hence the placeholder-count warnings below.
		$total = (int) $wpdb->get_var(
			$wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE {$where}", ...$params )
		);

		$offset = max( 0, ( $page - 1 ) * $per_page );

		$found = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE {$where} ORDER BY last_name, first_name LIMIT %d OFFSET %d",
				...array_merge( $params, array( $per_page, $offset ) )
			),
			ARRAY_A
		);
		// phpcs:enable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders

		$rows = null === $found ? array() : $found;

		return array(
			'items' => array_map( array( $this, 'hydrate' ), $rows ),
			'total' => $total,
		);
	}

	/**
	 * Update a client's fields — only keys present in $data are touched.
	 *
	 * @param int                  $id   Internal client ID.
	 * @param array<string, mixed> $data Fields to update.
	 */
	public function update( int $id, array $data ): bool {
		global $wpdb;

		$fields = array();

		foreach ( array( 'first_name', 'last_name', 'email', 'goals', 'dietary_restrictions', 'status', 'avatar_id' ) as $field ) {
			if ( array_key_exists( $field, $data ) ) {
				$fields[ $field ] = $data[ $field ];
			}
		}

		if ( array_key_exists( 'allergies', $data ) ) {
			$fields['allergies'] = wp_json_encode( $data['allergies'] );
		}

		if ( array() === $fields ) {
			return true; // Nothing to update isn't an error.
		}

		$fields['updated_at'] = current_time( 'mysql' );

		$updated = $wpdb->update( $wpdb->prefix . 'nutrio_clients', $fields, array( 'id' => $id ) );

		if ( false !== $updated ) {
			// Fires after a client is updated.
			do_action( 'nutrio_client_updated', $id, $fields );
		}

		return false !== $updated;
	}

	/**
	 * Delete a client by internal ID.
	 *
	 * @param int $id Internal client ID.
	 */
	public function delete( int $id ): bool {
		global $wpdb;

		// Fires before delete, while the row still exists — an add-on may want to archive it.
		do_action( 'nutrio_client_before_delete', $id );

		$deleted = false !== $wpdb->delete( $wpdb->prefix . 'nutrio_clients', array( 'id' => $id ) );

		if ( $deleted ) {
			do_action( 'nutrio_client_deleted', $id );
		}

		return $deleted;
	}

	/**
	 * Convert a raw database row into typed, decoded fields.
	 *
	 * @param array<string, mixed> $row Raw database row.
	 *
	 * @return array<string, mixed>
	 */
	private function hydrate( array $row ): array {
		$row['id']                   = (int) $row['id'];
		$row['practitioner_user_id'] = (int) $row['practitioner_user_id'];
		$row['user_id']              = null === $row['user_id'] ? null : (int) $row['user_id'];
		$row['avatar_id']            = null === $row['avatar_id'] ? null : (int) $row['avatar_id'];
		$row['avatar_url']           = null === $row['avatar_id'] ? null : wp_get_attachment_url( (int) $row['avatar_id'] );
		$row['allergies']            = (array) json_decode( (string) $row['allergies'], true );

		return $row;
	}
}
