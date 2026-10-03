<?php
/**
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Tests\Unit\Nutrition;

use Nutrio\Nutrition\FoodCache;
use Nutrio\Nutrition\RecipeNutrientResolver;
use Nutrio\Repositories\RecipeRepository;
use Nutrio\Tests\TestCase;

final class RecipeNutrientResolverTest extends TestCase {

	private const ENERGY  = 1008;
	private const PROTEIN = 1003;

	/**
	 * Two ingredients: 150 g chicken breast (165 kcal, 31 g protein per
	 * 100 g) + 200 g white rice (130 kcal, 2.7 g protein per 100 g).
	 * Hand-computed (same fixtures as NutrientCalculatorTest):
	 *   energy:  247500 + 260000 = 507500
	 *   protein:  46500 +   5400 =  51900
	 */
	public function test_calculate_recipe_totals_resolves_each_ingredient_and_sums(): void {
		$recipes = $this->createMock( RecipeRepository::class );
		$recipes->method( 'items_for_recipe' )->with( 42 )->willReturn(
			array(
				array( 'id' => 1, 'food_id' => 100, 'quantity_grams' => 150.0 ),
				array( 'id' => 2, 'food_id' => 200, 'quantity_grams' => 200.0 ),
			)
		);

		$foods = $this->createMock( FoodCache::class );
		$foods->method( 'find' )->willReturnMap(
			array(
				array( 100, $this->chicken_breast_food() ),
				array( 200, $this->white_rice_food() ),
			)
		);

		$resolver = new RecipeNutrientResolver( $recipes, $foods );
		$totals   = $resolver->calculate_recipe_totals( 42 );

		self::assertSame( 507500, $totals[ self::ENERGY ] );
		self::assertSame( 51900, $totals[ self::PROTEIN ] );
	}

	public function test_serving_grams_spreads_the_ingredient_weight_across_servings(): void {
		$recipes = $this->createMock( RecipeRepository::class );
		$recipes->method( 'find' )->with( 42 )->willReturn( array( 'id' => 42, 'servings' => 2 ) );
		$recipes->method( 'items_for_recipe' )->with( 42 )->willReturn(
			array(
				array( 'id' => 1, 'food_id' => 100, 'quantity_grams' => 150.0 ),
				array( 'id' => 2, 'food_id' => 200, 'quantity_grams' => 200.0 ),
			)
		);

		$resolver = new RecipeNutrientResolver( $recipes, $this->createMock( FoodCache::class ) );

		self::assertSame( 175.0, $resolver->serving_grams( 42 ) );
	}

	public function test_a_deleted_food_is_skipped_rather_than_failing_the_whole_calculation(): void {
		$recipes = $this->createMock( RecipeRepository::class );
		$recipes->method( 'items_for_recipe' )->willReturn(
			array(
				array( 'id' => 1, 'food_id' => 100, 'quantity_grams' => 150.0 ),
				array( 'id' => 2, 'food_id' => 999, 'quantity_grams' => 50.0 ), // No longer in the cache.
			)
		);

		$foods = $this->createMock( FoodCache::class );
		$foods->method( 'find' )->willReturnMap(
			array(
				array( 100, $this->chicken_breast_food() ),
				array( 999, null ),
			)
		);

		$resolver = new RecipeNutrientResolver( $recipes, $foods );
		$totals   = $resolver->calculate_recipe_totals( 42 );

		// Only the chicken breast contributes; the missing food is silently skipped.
		self::assertSame( 247500, $totals[ self::ENERGY ] );
	}

	public function test_empty_recipe_produces_empty_totals(): void {
		$recipes = $this->createMock( RecipeRepository::class );
		$recipes->method( 'items_for_recipe' )->willReturn( array() );

		$foods = $this->createMock( FoodCache::class );

		$resolver = new RecipeNutrientResolver( $recipes, $foods );

		self::assertSame( array(), $resolver->calculate_recipe_totals( 42 ) );
	}

	/**
	 * The chicken+rice recipe above, but declared as making 2 servings
	 * — per-serving totals should be exactly half.
	 */
	public function test_calculate_per_serving_totals_divides_by_the_recipes_serving_count(): void {
		$recipes = $this->createMock( RecipeRepository::class );
		$recipes->method( 'find' )->with( 42 )->willReturn( array( 'id' => 42, 'servings' => 2 ) );
		$recipes->method( 'items_for_recipe' )->willReturn(
			array(
				array( 'id' => 1, 'food_id' => 100, 'quantity_grams' => 150.0 ),
				array( 'id' => 2, 'food_id' => 200, 'quantity_grams' => 200.0 ),
			)
		);

		$foods = $this->createMock( FoodCache::class );
		$foods->method( 'find' )->willReturnMap(
			array(
				array( 100, $this->chicken_breast_food() ),
				array( 200, $this->white_rice_food() ),
			)
		);

		$resolver     = new RecipeNutrientResolver( $recipes, $foods );
		$per_serving  = $resolver->calculate_per_serving_totals( 42 );

		self::assertSame( 253750, $per_serving[ self::ENERGY ] ); // 507500 / 2.
	}

	public function test_calculate_per_serving_totals_returns_null_for_a_nonexistent_recipe(): void {
		$recipes = $this->createMock( RecipeRepository::class );
		$recipes->method( 'find' )->willReturn( null );

		$foods = $this->createMock( FoodCache::class );

		$resolver = new RecipeNutrientResolver( $recipes, $foods );

		self::assertNull( $resolver->calculate_per_serving_totals( 999 ) );
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
