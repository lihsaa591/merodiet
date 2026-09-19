<?php
/**
 * Client-portal "my own data" REST endpoints.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\RestApi;

use Nutrio\Nutrition\FoodCache;
use Nutrio\Repositories\ClientRepository;
use Nutrio\Repositories\LogEntryRepository;
use Nutrio\Repositories\MeasurementRepository;
use Nutrio\Repositories\PlanRepository;
use Nutrio\Repositories\RecipeRepository;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * Every route here requires 'view_own_nutrio_plan' and resolves the
 * caller's own client_id via AbstractClientController — see that
 * class's docblock for why there's no separate per-request ownership
 * check the way practitioner-owned resources need one.
 */
final class MeController extends AbstractClientController {

	/**
	 * Route base — registers under nutrio/v1/me.
	 *
	 * @var string
	 */
	protected string $rest_base = 'me';

	/**
	 * Constructor.
	 *
	 * @param PlanRepository        $plans        Used to fetch the client's active assigned plan.
	 * @param LogEntryRepository    $logs         Used for the client's own compliance log.
	 * @param MeasurementRepository $measurements Used for the client's own measurements.
	 * @param ClientRepository      $clients      Used only to resolve current_client_id() (see AbstractClientController).
	 * @param FoodCache             $food_cache   Used to attach food detail to plan items.
	 * @param RecipeRepository      $recipes      Used to attach recipe detail to plan items.
	 */
	public function __construct(
		private readonly PlanRepository $plans,
		private readonly LogEntryRepository $logs,
		private readonly MeasurementRepository $measurements,
		private readonly ClientRepository $clients,
		private readonly FoodCache $food_cache,
		private readonly RecipeRepository $recipes
	) {}

	/**
	 * The repository AbstractClientController uses to resolve the
	 * logged-in user's own client_id.
	 */
	protected function client_repository(): ClientRepository {
		return $this->clients;
	}

	/**
	 * Register every /me/* route.
	 */
	public function register_routes(): void {
		$this->register_route(
			'/plan',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'get_plan' ),
			),
			required_capability: 'view_own_nutrio_plan'
		);

		$this->register_route(
			'/logs',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'list_logs' ),
				'args'     => array(
					'from' => array( 'type' => 'string' ),
					'to'   => array( 'type' => 'string' ),
				),
			),
			required_capability: 'view_own_nutrio_plan'
		);

		$this->register_route(
			'/logs',
			array(
				'methods'  => WP_REST_Server::CREATABLE,
				'callback' => array( $this, 'create_log' ),
				'args'     => self::log_write_args(),
			),
			required_capability: 'view_own_nutrio_plan'
		);

		$this->register_route(
			'/measurements',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'list_measurements' ),
				'args'     => array(
					'from' => array( 'type' => 'string' ),
					'to'   => array( 'type' => 'string' ),
				),
			),
			required_capability: 'view_own_nutrio_plan'
		);

		$this->register_route(
			'/measurements',
			array(
				'methods'  => WP_REST_Server::CREATABLE,
				'callback' => array( $this, 'create_measurement' ),
				'args'     => self::measurement_write_args(),
			),
			required_capability: 'view_own_nutrio_plan'
		);
	}

	/**
	 * GET /me/plan — the caller's currently active assigned plan, if any.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function get_plan( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$client_id = $this->current_client_id();

		if ( $client_id instanceof WP_Error ) {
			return $client_id;
		}

		$plan = $this->plans->find_active_for_client( $client_id, current_time( 'Y-m-d' ) );

		if ( null === $plan ) {
			return $this->success( null );
		}

		$plan['days'] = array_map(
			fn ( array $day ): array => array(
				'day_offset' => $day['day_offset'],
				'items'      => array_map(
					fn ( array $item ): array => $this->with_item_details( $item, (int) $plan['practitioner_user_id'] ),
					$this->plans->items_for_day( $day['id'] )
				),
			),
			$this->plans->days_for_plan( $plan['id'] )
		);

		return $this->success( $plan );
	}

	/**
	 * GET /me/logs — the caller's own compliance log, optionally windowed.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function list_logs( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$client_id = $this->current_client_id();

		if ( $client_id instanceof WP_Error ) {
			return $client_id;
		}

		$entries = $this->logs->all_for_client(
			$client_id,
			array(
				'from' => (string) ( $request->get_param( 'from' ) ?? '' ),
				'to'   => (string) ( $request->get_param( 'to' ) ?? '' ),
			)
		);

		return $this->success( $entries );
	}

	/**
	 * POST /me/logs — log a compliance entry for the caller. client_id
	 * is never read from the request — always the resolved caller's own.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function create_log( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$client_id = $this->current_client_id();

		if ( $client_id instanceof WP_Error ) {
			return $client_id;
		}

		$id = $this->logs->create_for_client(
			$client_id,
			array(
				'plan_item_id'   => $request->get_param( 'plan_item_id' ),
				'food_id'        => $request->get_param( 'food_id' ),
				'recipe_id'      => $request->get_param( 'recipe_id' ),
				'quantity_grams' => $request->get_param( 'quantity_grams' ),
				'servings'       => $request->get_param( 'servings' ),
				'log_date'       => (string) $request->get_param( 'log_date' ),
				'status'         => (string) $request->get_param( 'status' ),
				'notes'          => $request->get_param( 'notes' ),
			)
		);

		return $this->success( $this->logs->find( $id ), 201 );
	}

	/**
	 * GET /me/measurements — the caller's own measurements, optionally windowed.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function list_measurements( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$client_id = $this->current_client_id();

		if ( $client_id instanceof WP_Error ) {
			return $client_id;
		}

		$measurements = $this->measurements->all_for_client(
			$client_id,
			array(
				'from' => (string) ( $request->get_param( 'from' ) ?? '' ),
				'to'   => (string) ( $request->get_param( 'to' ) ?? '' ),
			)
		);

		return $this->success( $measurements );
	}

	/**
	 * POST /me/measurements — log a measurement for the caller.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function create_measurement( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$client_id = $this->current_client_id();

		if ( $client_id instanceof WP_Error ) {
			return $client_id;
		}

		$id = $this->measurements->create_for_client(
			$client_id,
			array(
				'measured_at'  => (string) $request->get_param( 'measured_at' ),
				'weight_grams' => $request->get_param( 'weight_grams' ),
				'metrics'      => (array) ( $request->get_param( 'metrics' ) ?? array() ),
				'notes'        => $request->get_param( 'notes' ),
			)
		);

		return $this->success( $this->measurements->find( $id ), 201 );
	}

	/**
	 * Attach a resolved food/recipe label to one plan item — same shape
	 * PlansController::with_item_details() attaches for the practitioner
	 * side, but scoped by the plan's OWN practitioner_user_id rather
	 * than current_practitioner_id(): the caller here is a client, not
	 * a practitioner, so there is no "current practitioner" to use, and
	 * a plan's items always belong to the same practitioner who owns
	 * the plan itself.
	 *
	 * @param array<string, mixed> $item                  Raw plan_items row.
	 * @param int                  $owning_practitioner_id The plan's own practitioner_user_id.
	 *
	 * @return array<string, mixed>
	 */
	private function with_item_details( array $item, int $owning_practitioner_id ): array {
		if ( null !== $item['food_id'] ) {
			$food                                       = $this->food_cache->find( $item['food_id'] );
			$item['food_description']                   = $food['description'] ?? null;
			$item['nutrients']                          = $food['nutrients'] ?? array();
			$item['recipe_name']                        = null;
			$item['recipe_nutrient_totals_per_serving'] = null;

			return $item;
		}

		$recipe                                     = $this->recipes->find_for_practitioner( (int) $item['recipe_id'], $owning_practitioner_id );
		$item['recipe_name']                        = $recipe['name'] ?? null;
		$item['recipe_nutrient_totals_per_serving'] = null;
		$item['food_description']                   = null;
		$item['nutrients']                          = null;

		return $item;
	}

	/**
	 * REST arg schema for POST /me/logs.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	private static function log_write_args(): array {
		return array(
			'plan_item_id'   => array( 'type' => 'integer' ),
			'food_id'        => array( 'type' => 'integer' ),
			'recipe_id'      => array( 'type' => 'integer' ),
			'quantity_grams' => array( 'type' => 'number' ),
			'servings'       => array( 'type' => 'number' ),
			'log_date'       => array(
				'required' => true,
				'type'     => 'string',
			),
			'status'         => array(
				'required' => true,
				'type'     => 'string',
				'enum'     => array( 'eaten', 'substituted', 'skipped' ),
			),
			'notes'          => array(
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_textarea_field',
			),
		);
	}

	/**
	 * REST arg schema for POST /me/measurements.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	private static function measurement_write_args(): array {
		return array(
			'measured_at'  => array(
				'required' => true,
				'type'     => 'string',
			),
			'weight_grams' => array( 'type' => 'integer' ),
			'metrics'      => array( 'type' => 'object' ),
			'notes'        => array(
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_textarea_field',
			),
		);
	}
}
