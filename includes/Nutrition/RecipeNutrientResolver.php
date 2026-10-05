<?php
/**
 * Recipe nutrient total orchestration.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Nutrition;

use MeroDiet\Repositories\RecipeRepository;

/**
 * Bridges a recipe's stored ingredient list (food_id + quantity_grams
 * rows) to NutrientCalculator, which itself knows nothing about
 * "recipes" — it only ever sees fully-resolved food-and-quantity line
 * items. This class does the resolving: fetching each ingredient's
 * cached nutrient profile before handing the flat list to the
 * calculator, keeping that engine itself free of any I/O.
 */
class RecipeNutrientResolver {

	/**
	 * Construct with the repository and cache this resolver reads through.
	 *
	 * @param RecipeRepository $recipes The recipe data access layer.
	 * @param FoodCache        $foods   The local food-data cache.
	 */
	public function __construct(
		private readonly RecipeRepository $recipes,
		private readonly FoodCache $foods
	) {}

	/**
	 * Totals for the recipe's full ingredient list, in integer minor units.
	 *
	 * @param int $recipe_id Internal recipe ID.
	 *
	 * @return array<int, int>
	 */
	public function calculate_recipe_totals( int $recipe_id ): array {
		$line_items = array();

		foreach ( $this->recipes->items_for_recipe( $recipe_id ) as $item ) {
			$food = $this->foods->find( $item['food_id'] );

			if ( null === $food ) {
				continue; // The cached food entry was deleted after this ingredient was added — skip it rather than fail the whole calculation.
			}

			$line_items[] = array(
				'nutrients'      => $food['nutrients'],
				'quantity_grams' => $item['quantity_grams'],
			);
		}

		return NutrientCalculator::calculate( $line_items );
	}

	/**
	 * Weight of one serving: the ingredients' combined grams spread
	 * across the recipe's declared serving count — what a client sees
	 * as "the portion size" for a recipe item.
	 *
	 * @param int $recipe_id Internal recipe ID.
	 *
	 * @return float|null Grams per serving, or null if the recipe doesn't exist or has no weighed ingredients.
	 */
	public function serving_grams( int $recipe_id ): ?float {
		$recipe = $this->recipes->find( $recipe_id );

		if ( null === $recipe ) {
			return null;
		}

		$total = 0.0;

		foreach ( $this->recipes->items_for_recipe( $recipe_id ) as $item ) {
			$total += $item['quantity_grams'];
		}

		return $total > 0.0 ? round( $total / max( 1, $recipe['servings'] ), 1 ) : null;
	}

	/**
	 * The recipe's totals divided across its declared serving count —
	 * i.e. "nutrition per serving," what a plan item consuming some
	 * number of servings actually scales from.
	 *
	 * @param int $recipe_id Internal recipe ID.
	 *
	 * @return array<int, int>|null Null if the recipe itself doesn't exist.
	 */
	public function calculate_per_serving_totals( int $recipe_id ): ?array {
		$recipe = $this->recipes->find( $recipe_id );

		if ( null === $recipe ) {
			return null;
		}

		$totals = $this->calculate_recipe_totals( $recipe_id );

		return NutrientCalculator::scale_recipe_totals( $totals, $recipe['servings'], 1.0 );
	}
}
