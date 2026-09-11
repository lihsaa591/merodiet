<?php
/**
 * Client roster REST endpoints.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\RestApi;

use Nutrio\Repositories\ClientRepository;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * CRUD over a practitioner's own client roster. Every route requires
 * 'manage_nutrio_clients' (the parent class's default); ownership of
 * the specific client row is additionally checked per-request via
 * assert_owns() — see AbstractPractitionerController's docblock for
 * why both layers matter.
 */
final class ClientsController extends AbstractPractitionerController {

	/**
	 * Route base — registers under nutrio/v1/clients.
	 *
	 * @var string
	 */
	protected string $rest_base = 'clients';

	/**
	 * Construct with the repository this controller reads/writes through.
	 *
	 * @param ClientRepository $clients The client roster data access layer.
	 */
	public function __construct( private readonly ClientRepository $clients ) {}

	/**
	 * Register the roster's CRUD routes.
	 */
	public function register_routes(): void {
		$this->register_route(
			'',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'list_clients' ),
			),
			required_capability: 'manage_nutrio_clients'
		);

		$this->register_route(
			'',
			array(
				'methods'  => WP_REST_Server::CREATABLE,
				'callback' => array( $this, 'create_client' ),
				'args'     => self::client_write_args( require_all: true ),
			),
			required_capability: 'manage_nutrio_clients'
		);

		$this->register_route(
			'/(?P<id>\d+)',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'get_client' ),
			),
			required_capability: 'manage_nutrio_clients'
		);

		$this->register_route(
			'/(?P<id>\d+)',
			array(
				'methods'  => WP_REST_Server::EDITABLE,
				'callback' => array( $this, 'update_client' ),
				'args'     => self::client_write_args( require_all: false ),
			),
			required_capability: 'manage_nutrio_clients'
		);

		$this->register_route(
			'/(?P<id>\d+)',
			array(
				'methods'  => WP_REST_Server::DELETABLE,
				'callback' => array( $this, 'delete_client' ),
			),
			required_capability: 'manage_nutrio_clients'
		);
	}

	/**
	 * GET /clients — the current practitioner's full roster.
	 */
	public function list_clients(): WP_REST_Response {
		return $this->success( $this->clients->all_for_practitioner( $this->current_practitioner_id() ) );
	}

	/**
	 * POST /clients — add a new client to the current practitioner's roster.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function create_client( WP_REST_Request $request ): WP_REST_Response {
		$id = $this->clients->create(
			$this->current_practitioner_id(),
			array(
				'first_name'           => (string) $request->get_param( 'first_name' ),
				'last_name'            => (string) $request->get_param( 'last_name' ),
				'email'                => (string) $request->get_param( 'email' ),
				'goals'                => $request->get_param( 'goals' ),
				'dietary_restrictions' => $request->get_param( 'dietary_restrictions' ),
				'allergies'            => (array) ( $request->get_param( 'allergies' ) ?? array() ),
			)
		);

		/**
		 * The just-created client.
		 *
		 * @var array<string, mixed> $client
		 */
		$client = $this->clients->find( $id );

		return $this->success( $client, 201 );
	}

	/**
	 * GET /clients/{id} — a single client, if owned by the current practitioner.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function get_client( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$client = $this->clients->find_for_practitioner( (int) $request->get_param( 'id' ), $this->current_practitioner_id() );
		$owns   = $this->assert_owns( $client );

		if ( true !== $owns ) {
			return $owns;
		}

		return $this->success( $client );
	}

	/**
	 * PATCH /clients/{id} — update a client owned by the current practitioner.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function update_client( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$id     = (int) $request->get_param( 'id' );
		$client = $this->clients->find_for_practitioner( $id, $this->current_practitioner_id() );
		$owns   = $this->assert_owns( $client );

		if ( true !== $owns ) {
			return $owns;
		}

		$data = array();

		foreach ( array( 'first_name', 'last_name', 'email', 'goals', 'dietary_restrictions', 'status', 'allergies' ) as $field ) {
			if ( null !== $request->get_param( $field ) ) {
				$data[ $field ] = $request->get_param( $field );
			}
		}

		$this->clients->update( $id, $data );

		/**
		 * The just-updated client.
		 *
		 * @var array<string, mixed> $updated
		 */
		$updated = $this->clients->find( $id );

		return $this->success( $updated );
	}

	/**
	 * DELETE /clients/{id} — remove a client owned by the current practitioner.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function delete_client( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$id     = (int) $request->get_param( 'id' );
		$client = $this->clients->find_for_practitioner( $id, $this->current_practitioner_id() );
		$owns   = $this->assert_owns( $client );

		if ( true !== $owns ) {
			return $owns;
		}

		$this->clients->delete( $id );

		return $this->success( array( 'deleted' => true ) );
	}

	/**
	 * REST arg schema shared by create and update.
	 *
	 * @param bool $require_all Whether name/email fields are required (true for create, false for update).
	 *
	 * @return array<string, array<string, mixed>>
	 */
	private static function client_write_args( bool $require_all ): array {
		return array(
			'first_name'           => array(
				'required'          => $require_all,
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_text_field',
			),
			'last_name'            => array(
				'required'          => $require_all,
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_text_field',
			),
			'email'                => array(
				'required'          => $require_all,
				'type'              => 'string',
				'format'            => 'email',
				'sanitize_callback' => 'sanitize_email',
			),
			'goals'                => array(
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_textarea_field',
			),
			'dietary_restrictions' => array(
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_textarea_field',
			),
			'allergies'            => array(
				'type'  => 'array',
				'items' => array( 'type' => 'string' ),
			),
			'status'               => array(
				'type' => 'string',
				'enum' => array( 'active', 'inactive' ),
			),
		);
	}
}
