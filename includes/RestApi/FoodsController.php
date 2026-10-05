<?php
/**
 * Food search REST endpoints.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\RestApi;

use MeroDiet\Nutrition\FoodDataService;
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
	 * Route base — registers under merodiet/v1/foods.
	 *
	 * @var string
	 */
	protected string $rest_base = 'foods';

	/**
	 * Results per "page" of search — a search-as-you-type UI, not a
	 * table, so this is a fixed batch size for "load more" rather than
	 * a client-controlled per_page like the paginated list endpoints.
	 *
	 * @var int
	 */
	private const SEARCH_PAGE_SIZE = 15;

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
					'query'           => array(
						'required'          => true,
						'type'              => 'string',
						'sanitize_callback' => 'sanitize_text_field',
					),
					'include_branded' => array(
						'type'    => 'boolean',
						'default' => false,
					),
					'page'            => array(
						'type'    => 'integer',
						'default' => 1,
					),
				),
			),
			required_capability: 'manage_merodiet_foods'
		);

		$this->register_route(
			'/(?P<fdc_id>\d+)/resolve',
			array(
				'methods'  => WP_REST_Server::CREATABLE,
				'callback' => array( $this, 'resolve' ),
			),
			required_capability: 'manage_merodiet_foods'
		);
	}

	/**
	 * GET /foods/search — live USDA search. Branded (manufacturer-supplied)
	 * results are excluded unless ?include_branded=1 — see
	 * FoodDataService::search()'s docblock for why. ?page=2, 3, ... fetches
	 * further batches for a "Load more" control, rather than a single
	 * unbounded fetch of every match.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function search( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$page   = max( 1, (int) $request->get_param( 'page' ) );
		$result = $this->food_data->search(
			(string) $request->get_param( 'query' ),
			(bool) $request->get_param( 'include_branded' ),
			self::SEARCH_PAGE_SIZE,
			$page
		);

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		return $this->success(
			array(
				'items'    => $result['items'],
				'has_more' => $page * self::SEARCH_PAGE_SIZE < $result['total_hits'],
			)
		);
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
