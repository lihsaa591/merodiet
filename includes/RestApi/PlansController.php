<?php
/**
 * Meal plan REST endpoints.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\RestApi;

use Nutrio\Nutrition\FoodCache;
use Nutrio\Nutrition\PlanNutrientResolver;
use Nutrio\Nutrition\RecipeNutrientResolver;
use Nutrio\Repositories\ClientRepository;
use Nutrio\Repositories\PlanRepository;
use Nutrio\Repositories\RecipeRepository;
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
		private readonly ClientRepository $clients,
		private readonly FoodCache $food_cache,
		private readonly RecipeRepository $recipes,
		private readonly RecipeNutrientResolver $recipe_resolver
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

		$this->register_route(
			'/(?P<id>\d+)/unassign',
			array(
				'methods'  => WP_REST_Server::CREATABLE,
				'callback' => array( $this, 'unassign_plan' ),
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

		return $this->success( $this->with_details( $plan ), 201 );
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

		return $this->success( $this->with_details( $plan ) );
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

		return $this->success( $this->with_details( $updated ) );
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

		return $this->success( $this->with_details( $assigned ) );
	}

	/**
	 * POST /plans/{id}/unassign — revert an assigned plan back to a draft,
	 * so a mistaken or since-outdated assignment can be corrected and
	 * reassigned, rather than left as a permanent dead end.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function unassign_plan( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$id   = (int) $request->get_param( 'id' );
		$plan = $this->plans->find_for_practitioner( $id, $this->current_practitioner_id() );
		$owns = $this->assert_owns( $plan );

		if ( true !== $owns ) {
			return $owns;
		}

		if ( 'assigned' !== $plan['status'] ) {
			return $this->error( 'nutrio_plan_not_assigned', __( 'This plan is not currently assigned.', 'nutrio' ), 409 );
		}

		$this->plans->unassign( $id );

		/**
		 * The just-unassigned plan.
		 *
		 * @var array<string, mixed> $updated
		 */
		$updated = $this->plans->find( $id );

		return $this->success( $this->with_details( $updated ) );
	}

	/**
	 * Attach nutrient totals to a plan row. Totals are live for a draft,
	 * frozen for an assigned plan — see class docblock for why the
	 * source differs by status. Used by list_plans(), which never reads
	 * per-item detail.
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
	 * Attach nutrient totals and full day/item detail to a plan row.
	 * Each item gets a resolved food_description or recipe_name attached
	 * so the frontend never has to look up a raw food_id/recipe_id
	 * itself. Used by every single-plan response.
	 *
	 * @param array<string, mixed> $plan Plan row.
	 *
	 * @return array<string, mixed>
	 */
	private function with_details( array $plan ): array {
		$plan = $this->with_totals( $plan );

		$plan['days'] = array_map(
			fn ( array $day ): array => array(
				'day_offset' => $day['day_offset'],
				'items'      => array_map( array( $this, 'with_item_details' ), $this->plans->items_for_day( $day['id'] ) ),
			),
			$this->plans->days_for_plan( $plan['id'] )
		);

		return $plan;
	}

	/**
	 * Attach a resolved label (and its source nutrients, for the
	 * frontend's live per-day estimate) to one plan item.
	 *
	 * @param array<string, mixed> $item Raw plan_items row.
	 *
	 * @return array<string, mixed>
	 */
	private function with_item_details( array $item ): array {
		if ( null !== $item['food_id'] ) {
			$food                     = $this->food_cache->find( $item['food_id'] );
			$item['food_description'] = $food['description'] ?? null;
			$item['nutrients']        = $food['nutrients'] ?? array();
			$item['recipe_name']      = null;
			$item['recipe_nutrient_totals_per_serving'] = null;

			return $item;
		}

		$recipe                      = $this->recipes->find_for_practitioner( (int) $item['recipe_id'], $this->current_practitioner_id() );
		$item['recipe_name']        = $recipe['name'] ?? null;
		$item['recipe_nutrient_totals_per_serving'] = null === $recipe
			? null
			: $this->recipe_resolver->calculate_per_serving_totals( (int) $item['recipe_id'] );
		$item['food_description']   = null;
		$item['nutrients']          = null;

		return $item;
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
