<?php
/**
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Tests\Unit\Nutrition;

use Nutrio\Nutrition\FoodCache;
use Nutrio\Nutrition\PlanNutrientResolver;
use Nutrio\Nutrition\RecipeNutrientResolver;
use Nutrio\Repositories\PlanRepository;
use Nutrio\Tests\TestCase;

final class PlanNutrientResolverTest extends TestCase {

	private const ENERGY  = 1008;
	private const PROTEIN = 1003;

	/**
	 * Day 0: 150 g chicken breast (direct food).
	 * Hand computation (same fixture as NutrientCalculatorTest):
	 *   energy: 165 * 1.5 = 247.5 kcal -> 247500 milli-kcal.
	 */
	public function test_a_direct_food_item_resolves_from_the_food_cache(): void {
		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'days_for_plan' )->willReturn( array( array( 'id' => 1, 'plan_id' => 5, 'day_offset' => 0 ) ) );
		$plans->method( 'items_for_day' )->with( 1 )->willReturn(
			array(
				array( 'food_id' => 100, 'recipe_id' => null, 'quantity_grams' => 150.0, 'servings' => null ),
			)
		);

		$foods = $this->createMock( FoodCache::class );
		$foods->method( 'find' )->with( 100 )->willReturn( $this->chicken_breast_food() );

		$recipe_resolver = $this->createMock( RecipeNutrientResolver::class );

		$resolver = new PlanNutrientResolver( $plans, $foods, $recipe_resolver );
		$totals   = $resolver->calculate_plan_totals( 5 );

		self::assertSame( 247500, $totals[0][ self::ENERGY ] );
	}

	/**
	 * Day 0: 2 servings of a recipe whose per-serving total is 200000
	 * milli-kcal -> 400000 for 2 servings.
	 */
	public function test_a_recipe_item_scales_the_recipes_per_serving_totals_by_servings_requested(): void {
		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'days_for_plan' )->willReturn( array( array( 'id' => 1, 'plan_id' => 5, 'day_offset' => 0 ) ) );
		$plans->method( 'items_for_day' )->willReturn(
			array(
				array( 'food_id' => null, 'recipe_id' => 42, 'quantity_grams' => null, 'servings' => 2.0 ),
			)
		);

		$foods = $this->createMock( FoodCache::class );

		$recipe_resolver = $this->createMock( RecipeNutrientResolver::class );
		$recipe_resolver->method( 'calculate_per_serving_totals' )->with( 42 )->willReturn( array( self::ENERGY => 200000 ) );

		$resolver = new PlanNutrientResolver( $plans, $foods, $recipe_resolver );
		$totals   = $resolver->calculate_plan_totals( 5 );

		self::assertSame( 400000, $totals[0][ self::ENERGY ] );
	}

	/**
	 * Two days, each with a different item — totals must be keyed by
	 * the correct day_offset, not just concatenated.
	 */
	public function test_multiple_days_are_kept_separate_and_correctly_keyed(): void {
		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'days_for_plan' )->willReturn(
			array(
				array( 'id' => 1, 'plan_id' => 5, 'day_offset' => 0 ),
				array( 'id' => 2, 'plan_id' => 5, 'day_offset' => 1 ),
			)
		);
		$plans->method( 'items_for_day' )->willReturnMap(
			array(
				array( 1, array( array( 'food_id' => 100, 'recipe_id' => null, 'quantity_grams' => 150.0, 'servings' => null ) ) ),
				array( 2, array( array( 'food_id' => 200, 'recipe_id' => null, 'quantity_grams' => 200.0, 'servings' => null ) ) ),
			)
		);

		$foods = $this->createMock( FoodCache::class );
		$foods->method( 'find' )->willReturnMap(
			array(
				array( 100, $this->chicken_breast_food() ),
				array( 200, $this->white_rice_food() ),
			)
		);

		$recipe_resolver = $this->createMock( RecipeNutrientResolver::class );

		$resolver = new PlanNutrientResolver( $plans, $foods, $recipe_resolver );
		$totals   = $resolver->calculate_plan_totals( 5 );

		self::assertSame( 247500, $totals[0][ self::ENERGY ] ); // Day 0: chicken.
		self::assertSame( 260000, $totals[1][ self::ENERGY ] ); // Day 1: rice (130 * 2 = 260 kcal).
	}

	public function test_a_deleted_food_is_skipped_rather_than_failing_the_whole_day(): void {
		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'days_for_plan' )->willReturn( array( array( 'id' => 1, 'plan_id' => 5, 'day_offset' => 0 ) ) );
		$plans->method( 'items_for_day' )->willReturn(
			array(
				array( 'food_id' => 999, 'recipe_id' => null, 'quantity_grams' => 50.0, 'servings' => null ),
			)
		);

		$foods = $this->createMock( FoodCache::class );
		$foods->method( 'find' )->with( 999 )->willReturn( null );

		$recipe_resolver = $this->createMock( RecipeNutrientResolver::class );

		$resolver = new PlanNutrientResolver( $plans, $foods, $recipe_resolver );
		$totals   = $resolver->calculate_plan_totals( 5 );

		self::assertSame( array(), $totals[0] );
	}

	public function test_a_deleted_recipe_is_skipped_rather_than_failing_the_whole_day(): void {
		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'days_for_plan' )->willReturn( array( array( 'id' => 1, 'plan_id' => 5, 'day_offset' => 0 ) ) );
		$plans->method( 'items_for_day' )->willReturn(
			array(
				array( 'food_id' => null, 'recipe_id' => 999, 'quantity_grams' => null, 'servings' => 1.0 ),
			)
		);

		$foods = $this->createMock( FoodCache::class );

		$recipe_resolver = $this->createMock( RecipeNutrientResolver::class );
		$recipe_resolver->method( 'calculate_per_serving_totals' )->willReturn( null );

		$resolver = new PlanNutrientResolver( $plans, $foods, $recipe_resolver );
		$totals   = $resolver->calculate_plan_totals( 5 );

		self::assertSame( array(), $totals[0] );
	}

	public function test_an_item_with_neither_food_nor_recipe_set_contributes_nothing(): void {
		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'days_for_plan' )->willReturn( array( array( 'id' => 1, 'plan_id' => 5, 'day_offset' => 0 ) ) );
		$plans->method( 'items_for_day' )->willReturn(
			array(
				array( 'food_id' => null, 'recipe_id' => null, 'quantity_grams' => null, 'servings' => null ),
			)
		);

		$foods           = $this->createMock( FoodCache::class );
		$recipe_resolver = $this->createMock( RecipeNutrientResolver::class );

		$resolver = new PlanNutrientResolver( $plans, $foods, $recipe_resolver );
		$totals   = $resolver->calculate_plan_totals( 5 );

		self::assertSame( array(), $totals[0] );
	}

	public function test_a_day_with_multiple_items_merges_them_correctly(): void {
		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'days_for_plan' )->willReturn( array( array( 'id' => 1, 'plan_id' => 5, 'day_offset' => 0 ) ) );
		$plans->method( 'items_for_day' )->willReturn(
			array(
				array( 'food_id' => 100, 'recipe_id' => null, 'quantity_grams' => 150.0, 'servings' => null ),
				array( 'food_id' => 200, 'recipe_id' => null, 'quantity_grams' => 200.0, 'servings' => null ),
			)
		);

		$foods = $this->createMock( FoodCache::class );
		$foods->method( 'find' )->willReturnMap(
			array(
				array( 100, $this->chicken_breast_food() ),
				array( 200, $this->white_rice_food() ),
			)
		);

		$recipe_resolver = $this->createMock( RecipeNutrientResolver::class );

		$resolver = new PlanNutrientResolver( $plans, $foods, $recipe_resolver );
		$totals   = $resolver->calculate_plan_totals( 5 );

		// Same chicken+rice combination as NutrientCalculatorTest's multi-ingredient plate.
		self::assertSame( 507500, $totals[0][ self::ENERGY ] );
	}

	/**
	 * @return array{id:int, source:string, source_id:int, description:string, data_type:string, nutrients:array<int, array{amount_per_100g:float}>}
	 */
	private function chicken_breast_food(): array {
		return array(
			'id'          => 100,
			'source'      => 'usda',
			'source_id'   => 1,
			'description' => 'Chicken breast',
			'data_type'   => 'Foundation',
			'nutrients'   => array(
				self::ENERGY  => array( 'amount_per_100g' => 165.0 ),
				self::PROTEIN => array( 'amount_per_100g' => 31.0 ),
			),
		);
	}

	/**
	 * @return array{id:int, source:string, source_id:int, description:string, data_type:string, nutrients:array<int, array{amount_per_100g:float}>}
	 */
	private function white_rice_food(): array {
		return array(
			'id'          => 200,
			'source'      => 'usda',
			'source_id'   => 2,
			'description' => 'White rice',
			'data_type'   => 'Foundation',
			'nutrients'   => array(
				self::ENERGY  => array( 'amount_per_100g' => 130.0 ),
				self::PROTEIN => array( 'amount_per_100g' => 2.7 ),
			),
		);
	}
}
