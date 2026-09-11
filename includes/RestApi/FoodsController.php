<?php
/**
 * Food search REST endpoints.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\RestApi;

use Nutrio\Nutrition\FoodDataService;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * A thin REST wrapper around FoodDataService, for the recipe/plan
 * builder UI to search USDA foods and resolve one into the local
 * cache. Not an "owned" resource like clients/recipes/plans — any
 * practitioner can search/resolve any food, so this extends
 * AbstractPractitionerController only for its capability gate, and
 * never calls assert_owns().
 */
final class FoodsController extends AbstractPractitionerController {

	/**
	 * Route base — registers under nutrio/v1/foods.
	 *
	 * @var string
	 */
	protected string $rest_base = 'foods';

	/**
	 * Construct with the service this controller reads/resolves through.
	 *
	 * @param FoodDataService $food_data Orchestrates USDA search/resolve against the local cache.
	 */
	public function __construct( private readonly FoodDataService $food_data ) {}

	/**
	 * Register the search and resolve routes.
	 */
	public function register_routes(): void {
		$this->register_route(
			'/search',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'search' ),
				'args'     => array(
					'query' => array(
						'required'          => true,
						'type'              => 'string',
						'sanitize_callback' => 'sanitize_text_field',
					),
				),
			),
			required_capability: 'manage_nutrio_foods'
		);

		$this->register_route(
			'/(?P<fdc_id>\d+)/resolve',
			array(
				'methods'  => WP_REST_Server::CREATABLE,
				'callback' => array( $this, 'resolve' ),
			),
			required_capability: 'manage_nutrio_foods'
		);
	}

	/**
	 * GET /foods/search — live USDA search, restricted to the
	 * configured preferred data types (see config('fooddata.data_types')).
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function search( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$results = $this->food_data->search( (string) $request->get_param( 'query' ) );

		if ( is_wp_error( $results ) ) {
			return $results;
		}

		return $this->success( $results );
	}

	/**
	 * POST /foods/{fdc_id}/resolve — fetch (and cache, on first use) one
	 * food's full nutrient profile, ready to use in a recipe or plan item.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function resolve( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$food = $this->food_data->resolve( (int) $request->get_param( 'fdc_id' ) );

		if ( is_wp_error( $food ) ) {
			return $food;
		}

		return $this->success( $food );
	}
}
