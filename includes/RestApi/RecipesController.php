<?php
/**
 * Recipe library REST endpoints.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\RestApi;

use Nutrio\Nutrition\FoodCache;
use Nutrio\Nutrition\RecipeNutrientResolver;
use Nutrio\Repositories\RecipeRepository;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * CRUD over a practitioner's own recipe library. Every response
 * includes the recipe's per-serving nutrient totals, computed fresh
 * via RecipeNutrientResolver — recipes (unlike assigned plans) are
 * never snapshotted, since a recipe is a live, reusable building block
 * that should always reflect the current food-data cache.
 */
final class RecipesController extends AbstractPractitionerController {

	/**
	 * Route base — registers under nutrio/v1/recipes.
	 *
	 * @var string
	 */
	protected string $rest_base = 'recipes';

	/**
	 * Construct with the repository and resolver this controller reads through.
	 *
	 * @param RecipeRepository       $recipes    The recipe library data access layer.
	 * @param RecipeNutrientResolver $resolver   Computes a recipe's live nutrient totals.
	 * @param FoodCache              $food_cache Resolves an item's food_id to a display description.
	 */
	public function __construct(
		private readonly RecipeRepository $recipes,
		private readonly RecipeNutrientResolver $resolver,
		private readonly FoodCache $food_cache
	) {}

	/**
	 * Register the library's CRUD routes.
	 */
	public function register_routes(): void {
		$this->register_route(
			'',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'list_recipes' ),
			),
			required_capability: 'manage_nutrio_recipes'
		);

		$this->register_route(
			'',
			array(
				'methods'  => WP_REST_Server::CREATABLE,
				'callback' => array( $this, 'create_recipe' ),
				'args'     => self::recipe_write_args( require_all: true ),
			),
			required_capability: 'manage_nutrio_recipes'
		);

		$this->register_route(
			'/(?P<id>\d+)',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'get_recipe' ),
			),
			required_capability: 'manage_nutrio_recipes'
		);

		$this->register_route(
			'/(?P<id>\d+)',
			array(
				'methods'  => WP_REST_Server::EDITABLE,
				'callback' => array( $this, 'update_recipe' ),
				'args'     => self::recipe_write_args( require_all: false ),
			),
			required_capability: 'manage_nutrio_recipes'
		);

		$this->register_route(
			'/(?P<id>\d+)',
			array(
				'methods'  => WP_REST_Server::DELETABLE,
				'callback' => array( $this, 'delete_recipe' ),
			),
			required_capability: 'manage_nutrio_recipes'
		);
	}

	/**
	 * GET /recipes — the current practitioner's full library.
	 */
	public function list_recipes(): WP_REST_Response {
		$recipes = $this->recipes->all_for_practitioner( $this->current_practitioner_id() );

		return $this->success( array_map( array( $this, 'with_details' ), $recipes ) );
	}

	/**
	 * POST /recipes — add a new recipe to the current practitioner's library.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function create_recipe( WP_REST_Request $request ): WP_REST_Response {
		$id = $this->recipes->create(
			$this->current_practitioner_id(),
			array(
				'name'        => (string) $request->get_param( 'name' ),
				'description' => $request->get_param( 'description' ),
				'servings'    => (int) ( $request->get_param( 'servings' ) ?? 1 ),
				'items'       => (array) $request->get_param( 'items' ),
			)
		);

		/**
		 * The just-created recipe.
		 *
		 * @var array<string, mixed> $recipe
		 */
		$recipe = $this->recipes->find( $id );

		return $this->success( $this->with_details( $recipe ), 201 );
	}

	/**
	 * GET /recipes/{id} — a single recipe, if owned by the current practitioner.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function get_recipe( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$recipe = $this->recipes->find_for_practitioner( (int) $request->get_param( 'id' ), $this->current_practitioner_id() );
		$owns   = $this->assert_owns( $recipe );

		if ( true !== $owns ) {
			return $owns;
		}

		return $this->success( $this->with_details( $recipe ) );
	}

	/**
	 * PATCH /recipes/{id} — update a recipe owned by the current practitioner.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function update_recipe( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$id     = (int) $request->get_param( 'id' );
		$recipe = $this->recipes->find_for_practitioner( $id, $this->current_practitioner_id() );
		$owns   = $this->assert_owns( $recipe );

		if ( true !== $owns ) {
			return $owns;
		}

		$data = array();

		foreach ( array( 'name', 'description', 'servings', 'items' ) as $field ) {
			if ( null !== $request->get_param( $field ) ) {
				$data[ $field ] = $request->get_param( $field );
			}
		}

		$this->recipes->update( $id, $data );

		/**
		 * The just-updated recipe.
		 *
		 * @var array<string, mixed> $updated
		 */
		$updated = $this->recipes->find( $id );

		return $this->success( $this->with_details( $updated ) );
	}

	/**
	 * DELETE /recipes/{id} — remove a recipe owned by the current practitioner.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function delete_recipe( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$id     = (int) $request->get_param( 'id' );
		$recipe = $this->recipes->find_for_practitioner( $id, $this->current_practitioner_id() );
		$owns   = $this->assert_owns( $recipe );

		if ( true !== $owns ) {
			return $owns;
		}

		$this->recipes->delete( $id );

		return $this->success( array( 'deleted' => true ) );
	}

	/**
	 * Attach live-computed per-serving nutrient totals and the recipe's
	 * own ingredient list (with each item's food description resolved
	 * for display) to a recipe row.
	 *
	 * @param array<string, mixed> $recipe Recipe row.
	 *
	 * @return array<string, mixed>
	 */
	private function with_details( array $recipe ): array {
		$recipe['nutrient_totals_per_serving'] = $this->resolver->calculate_per_serving_totals( $recipe['id'] );
		$recipe['items']                       = array_map(
			function ( array $item ): array {
				$food                     = $this->food_cache->find( $item['food_id'] );
				$item['food_description'] = $food['description'] ?? null;

				return $item;
			},
			$this->recipes->items_for_recipe( $recipe['id'] )
		);

		return $recipe;
	}

	/**
	 * REST arg schema shared by create and update.
	 *
	 * @param bool $require_all Whether name/items are required (true for create, false for update).
	 *
	 * @return array<string, array<string, mixed>>
	 */
	private static function recipe_write_args( bool $require_all ): array {
		return array(
			'name'        => array(
				'required'          => $require_all,
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_text_field',
			),
			'description' => array(
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_textarea_field',
			),
			'servings'    => array(
				'type'    => 'integer',
				'minimum' => 1,
			),
			'items'       => array(
				'required' => $require_all,
				'type'     => 'array',
				'items'    => array(
					'type'       => 'object',
					'properties' => array(
						'food_id'        => array( 'type' => 'integer' ),
						'quantity_grams' => array( 'type' => 'number' ),
					),
				),
			),
		);
	}
}
