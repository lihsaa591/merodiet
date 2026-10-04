<?php
/**
 * Plan nutrient total orchestration.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Nutrition;

use Nutrio\Repositories\PlanRepository;

/**
 * Computes a plan's nutrient totals per day — {day_offset: {nutrient_id:
 * amount}} — the exact shape the plans table's nutrient_snapshot column
 * stores once a plan is assigned (see that migration's docblock).
 *
 * A plan item is either a direct food (quantity_grams of it) or a
 * recipe (some number of servings of it) — never both, an
 * application-level invariant documented on the plan_items migration.
 * Recipe-based items go through RecipeNutrientResolver's per-serving
 * totals rather than re-deriving them from scratch, so a recipe's
 * nutrient math is computed in exactly one place regardless of whether
 * it's being viewed on its own or as part of a plan.
 */
class PlanNutrientResolver {

	/**
	 * Construct with the repository, cache, and resolver this class reads through.
	 *
	 * @param PlanRepository         $plans           The plan data access layer.
	 * @param FoodCache              $foods           The local food-data cache.
	 * @param RecipeNutrientResolver $recipe_resolver Computes a recipe's per-serving totals.
	 */
	public function __construct(
		private readonly PlanRepository $plans,
		private readonly FoodCache $foods,
		private readonly RecipeNutrientResolver $recipe_resolver
	) {}

	/**
	 * Totals for every day in the plan, live from the current food/recipe data.
	 *
	 * @param int $plan_id Internal plan ID.
	 *
	 * @return array<int, array<int, int>> day_offset => {nutrient_id: amount}, in minor units.
	 */
	public function calculate_plan_totals( int $plan_id ): array {
		$totals_by_day = array();

		foreach ( $this->plans->days_for_plan( $plan_id ) as $day ) {
			$item_totals_list = array();

			foreach ( $this->plans->items_for_day( $day['id'] ) as $item ) {
				$item_totals_list[] = $this->calculate_item_totals( $item );
			}

			$totals_by_day[ $day['day_offset'] ] = NutrientCalculator::merge_totals( $item_totals_list );
		}

		return $totals_by_day;
	}

	/**
	 * Totals for a single plan item — a direct food, or some number of
	 * servings of a recipe.
	 *
	 * @param array{food_id:int|null, recipe_id:int|null, quantity_grams:float|null, servings:float|null} $item The plan item.
	 *
	 * @return array<int, int>
	 */
	private function calculate_item_totals( array $item ): array {
		if ( null !== $item['food_id'] ) {
			return $this->calculate_direct_food_totals( $item['food_id'], (float) $item['quantity_grams'] );
		}

		if ( null !== $item['recipe_id'] ) {
			return $this->calculate_recipe_servings_totals( $item['recipe_id'], (float) $item['servings'] );
		}

		return array(); // Neither set — a malformed item; contributes nothing rather than erroring.
	}

	/**
	 * Totals for a fixed quantity of a single food.
	 *
	 * @param int   $food_id        Internal food ID.
	 * @param float $quantity_grams Quantity consumed, in grams.
	 *
	 * @return array<int, int>
	 */
	private function calculate_direct_food_totals( int $food_id, float $quantity_grams ): array {
		$food = $this->foods->find( $food_id );

		if ( null === $food ) {
			return array(); // The cached food entry was deleted after this item was added.
		}

		return NutrientCalculator::calculate(
			array(
				array(
					'nutrients'      => $food['nutrients'],
					'quantity_grams' => $quantity_grams,
				),
			)
		);
	}

	/**
	 * Totals for a number of servings of a recipe.
	 *
	 * @param int   $recipe_id Internal recipe ID.
	 * @param float $servings  Number of servings consumed.
	 *
	 * @return array<int, int>
	 */
	private function calculate_recipe_servings_totals( int $recipe_id, float $servings ): array {
		$per_serving = $this->recipe_resolver->calculate_per_serving_totals( $recipe_id );

		if ( null === $per_serving ) {
			return array(); // The recipe was deleted after this item was added.
		}

		$scaled = array();

		foreach ( $per_serving as $nutrient_id => $amount ) {
			$scaled[ $nutrient_id ] = (int) round( $amount * $servings );
		}

		return $scaled;
	}
}
