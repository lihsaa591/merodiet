<?php
/**
 * Client roster REST endpoints.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\RestApi;

use Nutrio\Clients\ClientInviteService;
use Nutrio\Clients\ComplianceCalculator;
use Nutrio\Clients\LogEntryLabelResolver;
use Nutrio\Email\Mailer;
use Nutrio\Repositories\ClientRepository;
use Nutrio\Repositories\LogEntryRepository;
use Nutrio\Repositories\MeasurementRepository;
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
	 * Filters the list route accepts — see AbstractPractitionerController::filter_args().
	 *
	 * @var string[]
	 */
	private const LIST_FILTERS = array( 'search', 'status' );

	/**
	 * Construct with the repository/service/calculator this controller uses.
	 *
	 * @param ClientRepository      $clients      The client roster data access layer.
	 * @param ClientInviteService   $invites      The client invite provisioning service.
	 * @param LogEntryRepository    $logs         A client's compliance log entries.
	 * @param MeasurementRepository $measurements A client's weight/measurement entries.
	 * @param ComplianceCalculator  $compliance   Computes a client's plan-compliance percentage.
	 * @param Mailer                $mailer       Sends transactional/notification emails.
	 * @param LogEntryLabelResolver $log_labels   Resolves food/recipe names for log entries.
	 */
	public function __construct(
		private readonly ClientRepository $clients,
		private readonly ClientInviteService $invites,
		private readonly LogEntryRepository $logs,
		private readonly MeasurementRepository $measurements,
		private readonly ComplianceCalculator $compliance,
		private readonly Mailer $mailer,
		private readonly LogEntryLabelResolver $log_labels
	) {}

	/**
	 * Register the roster's CRUD routes.
	 */
	public function register_routes(): void {
		$this->register_route(
			'',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'list_clients' ),
				'args'     => array_merge(
					self::pagination_route_args(),
					self::filter_route_args( self::LIST_FILTERS )
				),
			),
			required_capability: 'manage_nutrio_clients'
		);

		$this->register_route(
			'',
			array(
				'methods'  => WP_REST_Server::CREATABLE,
				'callback' => array( $this, 'create_client' ),
				'args'     => array_merge(
					self::client_write_args( require_all: true ),
					array(
						'send_invite' => array(
							'type'    => 'boolean',
							'default' => false,
						),
					)
				),
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

		$this->register_route(
			'/(?P<id>\d+)/invite',
			array(
				'methods'  => WP_REST_Server::CREATABLE,
				'callback' => array( $this, 'invite_client' ),
			),
			required_capability: 'manage_nutrio_clients'
		);

		$this->register_route(
			'/(?P<id>\d+)/logs',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'get_client_logs' ),
				'args'     => array(
					'from' => array(
						'type'   => 'string',
						'format' => 'date',
					),
					'to'   => array(
						'type'   => 'string',
						'format' => 'date',
					),
				),
			),
			required_capability: 'manage_nutrio_clients'
		);

		$this->register_route(
			'/(?P<id>\d+)/measurements',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'get_client_measurements' ),
				'args'     => array(
					'from' => array(
						'type'   => 'string',
						'format' => 'date',
					),
					'to'   => array(
						'type'   => 'string',
						'format' => 'date',
					),
				),
			),
			required_capability: 'manage_nutrio_clients'
		);

		$this->register_route(
			'/(?P<id>\d+)/compliance',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'get_client_compliance' ),
				'args'     => array(
					'from' => array(
						'type'   => 'string',
						'format' => 'date',
					),
					'to'   => array(
						'type'   => 'string',
						'format' => 'date',
					),
				),
			),
			required_capability: 'manage_nutrio_clients'
		);
	}

	/**
	 * GET /clients — a page of the current practitioner's roster.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function list_clients( WP_REST_Request $request ): WP_REST_Response {
		[
			'page'     => $page,
			'per_page' => $per_page,
		] = $this->pagination_args( $request );

		$result = $this->clients->all_for_practitioner(
			$this->current_practitioner_id(),
			$page,
			$per_page,
			$this->filter_args( $request, self::LIST_FILTERS )
		);

		$items = array_map( array( self::class, 'with_portal_status' ), $result['items'] );

		return $this->success( $this->paginated_response( $items, $result['total'], $page, $per_page ) );
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

		// Provisioning the account and sending the invite is best-effort —
		// a failure here (e.g. the email is already tied to another WP
		// user) must not undo the client record that was just created;
		// it's surfaced to the caller instead, so the UI can tell the
		// practitioner to invite manually from the roster.
		$invite_error = null;

		if ( $request->get_param( 'send_invite' ) ) {
			$result = $this->invites->invite( $id );

			if ( is_wp_error( $result ) ) {
				$invite_error = $result->get_error_message();
			}
		}

		/**
		 * The just-created client.
		 *
		 * @var array<string, mixed> $client
		 */
		$client                 = self::with_portal_status( $this->clients->find( $id ) );
		$client['invite_error'] = $invite_error;

		$this->mailer->send(
			'practitioner_client_added',
			wp_get_current_user()->user_email,
			array(
				'practitioner_name' => wp_get_current_user()->display_name,
				'client_first_name' => (string) $client['first_name'],
				'client_last_name'  => (string) $client['last_name'],
				'invite_status'     => self::invite_status_copy( (bool) $request->get_param( 'send_invite' ), $invite_error ),
			)
		);

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

		return $this->success( self::with_portal_status( $client ) );
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

		return $this->success( self::with_portal_status( $updated ) );
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
	 * POST /clients/{id}/invite — provision (or re-invite) portal access
	 * for a client owned by the current practitioner.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function invite_client( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$id     = (int) $request->get_param( 'id' );
		$client = $this->clients->find_for_practitioner( $id, $this->current_practitioner_id() );
		$owns   = $this->assert_owns( $client );

		if ( true !== $owns ) {
			return $owns;
		}

		$result = $this->invites->invite( $id );

		if ( $result instanceof WP_Error ) {
			return $result;
		}

		$invited = $this->clients->find( $id );

		return $this->success( array_merge( array( 'invited' => true ), self::with_portal_status( $invited ) ) );
	}

	/**
	 * GET /clients/{id}/logs — a client's own compliance log, from the
	 * practitioner's side.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function get_client_logs( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$client = $this->clients->find_for_practitioner( (int) $request->get_param( 'id' ), $this->current_practitioner_id() );
		$owns   = $this->assert_owns( $client );

		if ( true !== $owns ) {
			return $owns;
		}

		$entries = $this->logs->all_for_client(
			(int) $client['id'],
			array(
				'from' => (string) ( $request->get_param( 'from' ) ?? '' ),
				'to'   => (string) ( $request->get_param( 'to' ) ?? '' ),
			)
		);

		return $this->success( $this->log_labels->with_labels( $entries ) );
	}

	/**
	 * GET /clients/{id}/measurements — a client's own measurements, from
	 * the practitioner's side.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function get_client_measurements( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$client = $this->clients->find_for_practitioner( (int) $request->get_param( 'id' ), $this->current_practitioner_id() );
		$owns   = $this->assert_owns( $client );

		if ( true !== $owns ) {
			return $owns;
		}

		$entries = $this->measurements->all_for_client(
			(int) $client['id'],
			array(
				'from' => (string) ( $request->get_param( 'from' ) ?? '' ),
				'to'   => (string) ( $request->get_param( 'to' ) ?? '' ),
			)
		);

		return $this->success( $entries );
	}

	/**
	 * GET /clients/{id}/compliance — the client's plan-compliance
	 * percentage over the requested window (defaults handled by
	 * ComplianceCalculator's caller — see get_client_compliance's own
	 * args schema for the 'from'/'to' date format).
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function get_client_compliance( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$client = $this->clients->find_for_practitioner( (int) $request->get_param( 'id' ), $this->current_practitioner_id() );
		$owns   = $this->assert_owns( $client );

		if ( true !== $owns ) {
			return $owns;
		}

		$result = $this->compliance->calculate(
			(int) $client['id'],
			(string) ( $request->get_param( 'from' ) ?? '' ),
			(string) ( $request->get_param( 'to' ) ?? '' )
		);

		return $this->success( $result );
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

	/**
	 * Build the human-readable invite-status copy for the notification email.
	 *
	 * @param bool        $send_invite_requested Whether the create request asked for an invite.
	 * @param string|null $invite_error           A failure message, if the invite attempt failed.
	 */
	private static function invite_status_copy( bool $send_invite_requested, ?string $invite_error ): string {
		if ( ! $send_invite_requested ) {
			return __( 'not invited (added without sending an invite)', 'nutrio' );
		}

		if ( null !== $invite_error ) {
			return sprintf(
				/* translators: %s: the reason the invite failed */
				__( 'invite failed: %s', 'nutrio' ),
				$invite_error
			);
		}

		return __( 'invited', 'nutrio' );
	}

	/**
	 * Annotate a client row with a derived `portal_status`, computed from
	 * `user_id` (set once they're invited) and WordPress's own
	 * `session_tokens` user meta (set once they've actually logged in) —
	 * there's no dedicated status column, so this is read fresh each time
	 * rather than stored.
	 *
	 * @param array<string, mixed> $client The client row, as returned by ClientRepository.
	 *
	 * @return array<string, mixed> The same row with `portal_status` added.
	 */
	private static function with_portal_status( array $client ): array {
		$user_id = $client['user_id'] ?? null;

		if ( null === $user_id ) {
			$client['portal_status'] = 'not_invited';
		} elseif ( get_user_meta( (int) $user_id, 'session_tokens', true ) ) {
			$client['portal_status'] = 'active';
		} else {
			$client['portal_status'] = 'invited';
		}

		return $client;
	}
}
