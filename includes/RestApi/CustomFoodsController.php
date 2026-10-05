<?php
/**
 * Custom (hand-entered) food REST endpoints.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\RestApi;

use MeroDiet\Nutrition\CustomFoodNutrientMap;
use MeroDiet\Repositories\CustomFoodRepository;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * CRUD over a practitioner's own custom foods — the manual-entry
 * counterpart to FoodsController's USDA search/resolve, for
 * ingredients not in USDA's database (a client's specific branded
 * product, a homemade blend). Reuses the 'manage_merodiet_foods'
 * capability FoodsController already gates on, since this is the same
 * domain.
 */
final class CustomFoodsController extends AbstractPractitionerController {

	/**
	 * Route base — registers under merodiet/v1/custom-foods.
	 *
	 * @var string
	 */
	protected string $rest_base = 'custom-foods';

	/**
	 * Filters the list route accepts — see AbstractPractitionerController::filter_args().
	 *
	 * @var string[]
	 */
	private const LIST_FILTERS = array( 'search' );

	/**
	 * Construct with the repository this controller reads/writes through.
	 *
	 * @param CustomFoodRepository $foods The custom-food data access layer.
	 */
	public function __construct( private readonly CustomFoodRepository $foods ) {}

	/**
	 * Register the CRUD routes.
	 */
	public function register_routes(): void {
		$this->register_route(
			'',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'list_foods' ),
				'args'     => array_merge(
					self::pagination_route_args(),
					self::filter_route_args( self::LIST_FILTERS )
				),
			),
			required_capability: 'manage_merodiet_foods'
		);

		$this->register_route(
			'',
			array(
				'methods'  => WP_REST_Server::CREATABLE,
				'callback' => array( $this, 'create_food' ),
				'args'     => self::food_write_args( require_name: true ),
			),
			required_capability: 'manage_merodiet_foods'
		);

		$this->register_route(
			'/(?P<id>\d+)',
			array(
				'methods'  => WP_REST_Server::EDITABLE,
				'callback' => array( $this, 'update_food' ),
				'args'     => self::food_write_args( require_name: false ),
			),
			required_capability: 'manage_merodiet_foods'
		);

		$this->register_route(
			'/(?P<id>\d+)',
			array(
				'methods'  => WP_REST_Server::DELETABLE,
				'callback' => array( $this, 'delete_food' ),
			),
			required_capability: 'manage_merodiet_foods'
		);
	}

	/**
	 * GET /custom-foods — a page of the current practitioner's own custom foods.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function list_foods( WP_REST_Request $request ): WP_REST_Response {
		[
			'page'     => $page,
			'per_page' => $per_page,
		] = $this->pagination_args( $request );

		$result = $this->foods->all_for_practitioner(
			$this->current_practitioner_id(),
			$page,
			$per_page,
			$this->filter_args( $request, self::LIST_FILTERS )
		);

		return $this->success( $this->paginated_response( $result['items'], $result['total'], $page, $per_page ) );
	}

	/**
	 * POST /custom-foods — add a new custom food to the current practitioner's set.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function create_food( WP_REST_Request $request ): WP_REST_Response {
		$id = $this->foods->create( $this->current_practitioner_id(), self::write_fields( $request ) );

		/**
		 * The just-created food.
		 *
		 * @var array<string, mixed> $food
		 */
		$food = $this->foods->find_for_practitioner( $id, $this->current_practitioner_id() );

		return $this->success( $food, 201 );
	}

	/**
	 * PATCH /custom-foods/{id} — update a custom food owned by the current practitioner.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function update_food( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$id   = (int) $request->get_param( 'id' );
		$food = $this->foods->find_for_practitioner( $id, $this->current_practitioner_id() );
		$owns = $this->assert_owns( $food, 'created_by' );

		if ( true !== $owns ) {
			return $owns;
		}

		$this->foods->update( $id, self::write_fields( $request ) );

		/**
		 * The just-updated food.
		 *
		 * @var array<string, mixed> $updated
		 */
		$updated = $this->foods->find_for_practitioner( $id, $this->current_practitioner_id() );

		return $this->success( $updated );
	}

	/**
	 * DELETE /custom-foods/{id} — remove a custom food owned by the
	 * current practitioner. Blocked (409) if any recipe still uses it,
	 * the same way an assigned plan blocks edits — silently orphaning a
	 * recipe's nutrient total would be worse than refusing the delete.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function delete_food( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$id   = (int) $request->get_param( 'id' );
		$food = $this->foods->find_for_practitioner( $id, $this->current_practitioner_id() );
		$owns = $this->assert_owns( $food, 'created_by' );

		if ( true !== $owns ) {
			return $owns;
		}

		if ( $this->foods->is_used_in_a_recipe( $id ) ) {
			return $this->error(
				'merodiet_food_in_use',
				__( 'This food is used in at least one recipe and cannot be deleted. Remove it from every recipe first.', 'merodiet' ),
				409
			);
		}

		$this->foods->delete( $id );

		return $this->success( array( 'deleted' => true ) );
	}

	/**
	 * Extract this controller's write fields (name + any curated
	 * nutrient field) from a request.
	 *
	 * @param WP_REST_Request $request The current request.
	 *
	 * @return array<string, mixed>
	 */
	private static function write_fields( WP_REST_Request $request ): array {
		$fields = array();

		foreach ( array_merge( array( 'name' ), CustomFoodNutrientMap::field_keys() ) as $key ) {
			if ( null !== $request->get_param( $key ) ) {
				$fields[ $key ] = $request->get_param( $key );
			}
		}

		return $fields;
	}

	/**
	 * REST arg schema shared by create and update.
	 *
	 * @param bool $require_name Whether name is required (true for create, false for update).
	 *
	 * @return array<string, array<string, mixed>>
	 */
	private static function food_write_args( bool $require_name ): array {
		$args = array(
			'name' => array(
				'required'          => $require_name,
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_text_field',
			),
		);

		foreach ( CustomFoodNutrientMap::field_keys() as $key ) {
			$args[ $key ] = array(
				'type'    => 'number',
				'minimum' => 0,
			);
		}

		return $args;
	}
}
