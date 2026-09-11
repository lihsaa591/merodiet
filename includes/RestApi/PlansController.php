<?php
/**
 * Meal plan REST endpoints.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\RestApi;

use Nutrio\Nutrition\PlanNutrientResolver;
use Nutrio\Repositories\ClientRepository;
use Nutrio\Repositories\PlanRepository;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * CRUD over a practitioner's own plans, plus the assign action that
 * locks a draft plan to a client and freezes its nutrient totals.
 *
 * A plan's nutrient totals in every response come from one of two
 * places depending on status — never recomputed once assigned:
 *
 * - draft:    computed live via PlanNutrientResolver, always reflecting
 *             the current food/recipe data.
 * - assigned: read from the frozen nutrient_snapshot column, exactly
 *             as it was at the moment of assignment — see the plans
 *             migration's docblock for why this must never change
 *             after the fact.
 *
 * Editing or deleting an assigned plan is rejected (409) rather than
 * silently allowed — a client has already received it.
 */
final class PlansController extends AbstractPractitionerController {

	/**
	 * Route base — registers under nutrio/v1/plans.
	 *
	 * @var string
	 */
	protected string $rest_base = 'plans';

	/**
	 * Construct with the repositories and resolver this controller reads/writes through.
	 *
	 * @param PlanRepository       $plans    The plan data access layer.
	 * @param PlanNutrientResolver $resolver Computes a draft plan's live nutrient totals.
	 * @param ClientRepository     $clients  Used to verify a plan is being assigned to the practitioner's own client.
	 */
	public function __construct(
		private readonly PlanRepository $plans,
		private readonly PlanNutrientResolver $resolver,
		private readonly ClientRepository $clients
	) {}

	/**
	 * Register the plan CRUD routes and the assign action.
	 */
	public function register_routes(): void {
		$this->register_route(
			'',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'list_plans' ),
			),
			required_capability: 'manage_nutrio_plans'
		);

		$this->register_route(
			'',
			array(
				'methods'  => WP_REST_Server::CREATABLE,
				'callback' => array( $this, 'create_plan' ),
				'args'     => self::plan_write_args( require_all: true ),
			),
			required_capability: 'manage_nutrio_plans'
		);

		$this->register_route(
			'/(?P<id>\d+)',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'get_plan' ),
			),
			required_capability: 'manage_nutrio_plans'
		);

		$this->register_route(
			'/(?P<id>\d+)',
			array(
				'methods'  => WP_REST_Server::EDITABLE,
				'callback' => array( $this, 'update_plan' ),
				'args'     => self::plan_write_args( require_all: false ),
			),
			required_capability: 'manage_nutrio_plans'
		);

		$this->register_route(
			'/(?P<id>\d+)',
			array(
				'methods'  => WP_REST_Server::DELETABLE,
				'callback' => array( $this, 'delete_plan' ),
			),
			required_capability: 'manage_nutrio_plans'
		);

		$this->register_route(
			'/(?P<id>\d+)/assign',
			array(
				'methods'  => WP_REST_Server::CREATABLE,
				'callback' => array( $this, 'assign_plan' ),
				'args'     => array(
					'client_id' => array(
						'required' => true,
						'type'     => 'integer',
					),
				),
			),
			required_capability: 'manage_nutrio_plans'
		);
	}

	/**
	 * GET /plans — the current practitioner's plans, most recent first.
	 */
	public function list_plans(): WP_REST_Response {
		$plans = $this->plans->all_for_practitioner( $this->current_practitioner_id() );

		return $this->success( array_map( array( $this, 'with_totals' ), $plans ) );
	}

	/**
	 * POST /plans — create a new draft plan.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function create_plan( WP_REST_Request $request ): WP_REST_Response {
		$id = $this->plans->create(
			$this->current_practitioner_id(),
			array(
				'title'      => (string) $request->get_param( 'title' ),
				'start_date' => (string) $request->get_param( 'start_date' ),
				'end_date'   => (string) $request->get_param( 'end_date' ),
				'days'       => (array) $request->get_param( 'days' ),
			)
		);

		/**
		 * The just-created plan.
		 *
		 * @var array<string, mixed> $plan
		 */
		$plan = $this->plans->find( $id );

		return $this->success( $this->with_totals( $plan ), 201 );
	}

	/**
	 * GET /plans/{id} — a single plan, if owned by the current practitioner.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function get_plan( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$plan = $this->plans->find_for_practitioner( (int) $request->get_param( 'id' ), $this->current_practitioner_id() );
		$owns = $this->assert_owns( $plan );

		if ( true !== $owns ) {
			return $owns;
		}

		return $this->success( $this->with_totals( $plan ) );
	}

	/**
	 * PATCH /plans/{id} — update a draft plan owned by the current
	 * practitioner. Rejected once the plan is assigned.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function update_plan( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$id   = (int) $request->get_param( 'id' );
		$plan = $this->plans->find_for_practitioner( $id, $this->current_practitioner_id() );
		$owns = $this->assert_owns( $plan );

		if ( true !== $owns ) {
			return $owns;
		}

		if ( 'assigned' === $plan['status'] ) {
			return $this->error( 'nutrio_plan_already_assigned', __( 'An assigned plan cannot be edited.', 'nutrio' ), 409 );
		}

		$data = array();

		foreach ( array( 'title', 'start_date', 'end_date', 'days' ) as $field ) {
			if ( null !== $request->get_param( $field ) ) {
				$data[ $field ] = $request->get_param( $field );
			}
		}

		$this->plans->update( $id, $data );

		/**
		 * The just-updated plan.
		 *
		 * @var array<string, mixed> $updated
		 */
		$updated = $this->plans->find( $id );

		return $this->success( $this->with_totals( $updated ) );
	}

	/**
	 * DELETE /plans/{id} — remove a draft plan owned by the current
	 * practitioner. Rejected once the plan is assigned.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function delete_plan( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$id   = (int) $request->get_param( 'id' );
		$plan = $this->plans->find_for_practitioner( $id, $this->current_practitioner_id() );
		$owns = $this->assert_owns( $plan );

		if ( true !== $owns ) {
			return $owns;
		}

		if ( 'assigned' === $plan['status'] ) {
			return $this->error( 'nutrio_plan_already_assigned', __( 'An assigned plan cannot be deleted.', 'nutrio' ), 409 );
		}

		$this->plans->delete( $id );

		return $this->success( array( 'deleted' => true ) );
	}

	/**
	 * POST /plans/{id}/assign — lock the plan to a client and freeze its
	 * nutrient totals. The target client must belong to the same
	 * practitioner as the plan — a cross-resource ownership check
	 * beyond the plan's own assert_owns().
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function assign_plan( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$id           = (int) $request->get_param( 'id' );
		$practitioner = $this->current_practitioner_id();

		$plan = $this->plans->find_for_practitioner( $id, $practitioner );
		$owns = $this->assert_owns( $plan );

		if ( true !== $owns ) {
			return $owns;
		}

		if ( 'assigned' === $plan['status'] ) {
			return $this->error( 'nutrio_plan_already_assigned', __( 'This plan has already been assigned.', 'nutrio' ), 409 );
		}

		$client_id = (int) $request->get_param( 'client_id' );
		$client    = $this->clients->find_for_practitioner( $client_id, $practitioner );

		if ( null === $client ) {
			return $this->error( 'nutrio_not_found', __( 'Client not found.', 'nutrio' ), 404 );
		}

		$snapshot = $this->resolver->calculate_plan_totals( $id );

		$this->plans->assign( $id, $client_id, $snapshot );

		/**
		 * The just-assigned plan.
		 *
		 * @var array<string, mixed> $assigned
		 */
		$assigned = $this->plans->find( $id );

		return $this->success( $this->with_totals( $assigned ) );
	}

	/**
	 * Attach nutrient totals to a plan row — live for a draft, frozen
	 * for an assigned plan. See class docblock for why the source
	 * differs by status.
	 *
	 * @param array<string, mixed> $plan Plan row.
	 *
	 * @return array<string, mixed>
	 */
	private function with_totals( array $plan ): array {
		$plan['nutrient_totals'] = 'assigned' === $plan['status']
			? $plan['nutrient_snapshot']
			: $this->resolver->calculate_plan_totals( $plan['id'] );

		return $plan;
	}

	/**
	 * REST arg schema shared by create and update.
	 *
	 * @param bool $require_all Whether title/dates/days are required (true for create, false for update).
	 *
	 * @return array<string, array<string, mixed>>
	 */
	private static function plan_write_args( bool $require_all ): array {
		return array(
			'title'      => array(
				'required'          => $require_all,
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_text_field',
			),
			'start_date' => array(
				'required' => $require_all,
				'type'     => 'string',
				'format'   => 'date',
			),
			'end_date'   => array(
				'required' => $require_all,
				'type'     => 'string',
				'format'   => 'date',
			),
			'days'       => array(
				'required' => $require_all,
				'type'     => 'array',
			),
		);
	}
}
