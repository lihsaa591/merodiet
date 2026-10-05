<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit\Nutrition;

use MeroDiet\Nutrition\NutrientCalculator;
use MeroDiet\Tests\TestCase;

/**
 * The credibility-defining test suite — see NutrientCalculator's
 * docblock. Every fixture here is hand-computed independently of the
 * production code, not derived from it.
 */
final class NutrientCalculatorTest extends TestCase {

	private const ENERGY  = 1008;
	private const PROTEIN = 1003;
	private const FAT     = 1004;
	private const CARBS   = 1005;

	// -----------------------------------------------------------------
	// Minor-unit conversion
	// -----------------------------------------------------------------

	public function test_to_minor_units_scales_by_1000_and_rounds(): void {
		self::assertSame( 1500, NutrientCalculator::to_minor_units( 1.5 ) );
		self::assertSame( 1235, NutrientCalculator::to_minor_units( 1.2345 ) ); // Rounds, doesn't truncate.
		self::assertSame( 0, NutrientCalculator::to_minor_units( 0.0 ) );
	}

	public function test_from_minor_units_is_the_inverse(): void {
		self::assertSame( 1.5, NutrientCalculator::from_minor_units( 1500 ) );
		self::assertSame( 0.245, NutrientCalculator::from_minor_units( 245 ) );
	}

	// -----------------------------------------------------------------
	// Single food — hand-computed against a real USDA-shaped fixture
	// -----------------------------------------------------------------

	/**
	 * 150 g of a food reporting, per 100 g: 165 kcal, 31 g protein,
	 * 3.6 g fat, 0 g carbs (this is real chicken-breast-shaped data).
	 *
	 * Hand computation for 150 g:
	 *   energy:  165 * 1.5 = 247.5  kcal -> 247500 milli-kcal
	 *   protein:  31 * 1.5 =  46.5  g    ->  46500 milli-g
	 *   fat:     3.6 * 1.5 =   5.4  g    ->   5400 milli-g
	 *   carbs:     0 * 1.5 =   0    g    ->      0 milli-g
	 */
	public function test_single_food_matches_hand_computed_totals(): void {
		$totals = NutrientCalculator::calculate(
			array(
				array(
					'nutrients'      => self::chicken_breast_per_100g(),
					'quantity_grams' => 150.0,
				),
			)
		);

		self::assertSame( 247500, $totals[ self::ENERGY ] );
		self::assertSame( 46500, $totals[ self::PROTEIN ] );
		self::assertSame( 5400, $totals[ self::FAT ] );
		self::assertSame( 0, $totals[ self::CARBS ] );
	}

	// -----------------------------------------------------------------
	// Multi-ingredient "recipe" — several foods in one calculate() call
	// -----------------------------------------------------------------

	/**
	 * A simple two-ingredient plate: 150 g chicken breast + 200 g white
	 * rice (per 100 g: 130 kcal, 2.7 g protein, 0.3 g fat, 28 g carbs).
	 *
	 * Hand computation for rice at 200 g:
	 *   energy:  130 * 2 = 260   kcal -> 260000 milli-kcal
	 *   protein: 2.7 * 2 =  5.4  g    ->   5400 milli-g
	 *   fat:     0.3 * 2 =  0.6  g    ->    600 milli-g
	 *   carbs:    28 * 2 = 56    g    ->  56000 milli-g
	 *
	 * Combined with the chicken totals from the previous test:
	 *   energy:  247500 + 260000 = 507500
	 *   protein:  46500 +   5400 =  51900
	 *   fat:       5400 +    600 =   6000
	 *   carbs:        0 +  56000 =  56000
	 */
	public function test_multi_ingredient_plate_sums_correctly(): void {
		$totals = NutrientCalculator::calculate(
			array(
				array(
					'nutrients'      => self::chicken_breast_per_100g(),
					'quantity_grams' => 150.0,
				),
				array(
					'nutrients'      => self::white_rice_per_100g(),
					'quantity_grams' => 200.0,
				),
			)
		);

		self::assertSame( 507500, $totals[ self::ENERGY ] );
		self::assertSame( 51900, $totals[ self::PROTEIN ] );
		self::assertSame( 6000, $totals[ self::FAT ] );
		self::assertSame( 56000, $totals[ self::CARBS ] );
	}

	public function test_empty_line_items_produce_empty_totals(): void {
		self::assertSame( array(), NutrientCalculator::calculate( array() ) );
	}

	public function test_zero_quantity_contributes_zero(): void {
		$totals = NutrientCalculator::calculate(
			array(
				array(
					'nutrients'      => self::chicken_breast_per_100g(),
					'quantity_grams' => 0.0,
				),
			)
		);

		self::assertSame( 0, $totals[ self::ENERGY ] );
		self::assertSame( 0, $totals[ self::PROTEIN ] );
	}

	// -----------------------------------------------------------------
	// A "full day" — multiple meals, i.e. multiple calculate() results merged
	// -----------------------------------------------------------------

	/**
	 * Breakfast: 150 g chicken breast (used here purely as a distinct,
	 * hand-computable fixture, not a realistic breakfast).
	 * Lunch: the chicken + rice plate from the previous test.
	 *
	 * Hand computation:
	 *   breakfast energy: 247500
	 *   lunch energy:     507500
	 *   day total:        755000
	 */
	public function test_full_day_merges_multiple_meals_correctly(): void {
		$breakfast = NutrientCalculator::calculate(
			array(
				array(
					'nutrients'      => self::chicken_breast_per_100g(),
					'quantity_grams' => 150.0,
				),
			)
		);

		$lunch = NutrientCalculator::calculate(
			array(
				array(
					'nutrients'      => self::chicken_breast_per_100g(),
					'quantity_grams' => 150.0,
				),
				array(
					'nutrients'      => self::white_rice_per_100g(),
					'quantity_grams' => 200.0,
				),
			)
		);

		$day_total = NutrientCalculator::merge_totals( array( $breakfast, $lunch ) );

		self::assertSame( 755000, $day_total[ self::ENERGY ] );
		self::assertSame( 98400, $day_total[ self::PROTEIN ] ); // 46500 + 51900
	}

	// -----------------------------------------------------------------
	// A day with a substitution — swap one item, recompute, must differ
	// -----------------------------------------------------------------

	public function test_substituting_an_item_changes_the_total_as_expected(): void {
		$original = NutrientCalculator::calculate(
			array(
				array(
					'nutrients'      => self::white_rice_per_100g(),
					'quantity_grams' => 200.0,
				),
			)
		);

		// Substitute rice for chicken at the same gram quantity.
		$substituted = NutrientCalculator::calculate(
			array(
				array(
					'nutrients'      => self::chicken_breast_per_100g(),
					'quantity_grams' => 200.0,
				),
			)
		);

		self::assertNotSame( $original[ self::ENERGY ], $substituted[ self::ENERGY ] );
		self::assertSame( 260000, $original[ self::ENERGY ] );
		self::assertSame( 330000, $substituted[ self::ENERGY ] ); // 165 * 2 = 330 kcal.
	}

	// -----------------------------------------------------------------
	// Recipe scaling
	// -----------------------------------------------------------------

	/**
	 * A recipe making 4 servings with a known total of 800000 milli-kcal
	 * (200 kcal/serving). Requesting 1.5 servings should yield exactly
	 * 300000 (1.5 * 200000), computed via the ratio, not by re-running
	 * calculate() against re-scaled ingredient quantities.
	 */
	public function test_scale_recipe_totals_applies_the_correct_ratio(): void {
		$recipe_totals = array( self::ENERGY => 800000 );

		$scaled = NutrientCalculator::scale_recipe_totals( $recipe_totals, 4, 1.5 );

		self::assertSame( 300000, $scaled[ self::ENERGY ] );
	}

	public function test_scale_recipe_totals_handles_a_single_serving(): void {
		$recipe_totals = array( self::ENERGY => 200000 );

		$scaled = NutrientCalculator::scale_recipe_totals( $recipe_totals, 1, 1.0 );

		self::assertSame( 200000, $scaled[ self::ENERGY ] );
	}

	public function test_scale_recipe_totals_rejects_a_recipe_with_zero_servings(): void {
		$this->expectException( \InvalidArgumentException::class );

		NutrientCalculator::scale_recipe_totals( array( self::ENERGY => 100 ), 0, 1.0 );
	}

	// -----------------------------------------------------------------
	// Determinism / purity — same input, same output, no hidden state
	// -----------------------------------------------------------------

	public function test_calculate_is_pure_and_deterministic(): void {
		$line_items = array(
			array(
				'nutrients'      => self::chicken_breast_per_100g(),
				'quantity_grams' => 137.0,
			),
		);

		$first  = NutrientCalculator::calculate( $line_items );
		$second = NutrientCalculator::calculate( $line_items );

		self::assertSame( $first, $second );
	}

	/**
	 * Simulates the "historical integrity" requirement at the engine
	 * level: a caller that captured a food's nutrient data at time A
	 * and stores/re-supplies that exact snapshot must get time-A
	 * results forever, regardless of what the live food cache says now.
	 * The engine has no internal cache or global state to leak this
	 * through — proving that is the point of this test.
	 */
	public function test_calculate_is_unaffected_by_a_later_food_data_correction(): void {
		$version_a = self::chicken_breast_per_100g(); // energy: 165 kcal/100g.
		$version_b = self::chicken_breast_per_100g();
		$version_b[ self::ENERGY ]['amount_per_100g'] = 172.0; // A hypothetical USDA correction.

		$original_totals = NutrientCalculator::calculate(
			array( array( 'nutrients' => $version_a, 'quantity_grams' => 150.0 ) )
		);

		// A caller holding onto the version-A snapshot (as an assigned
		// plan's nutrient_snapshot does) must still get the original
		// number when it recomputes from that same stored snapshot —
		// not the corrected one.
		$recomputed_from_snapshot = NutrientCalculator::calculate(
			array( array( 'nutrients' => $version_a, 'quantity_grams' => 150.0 ) )
		);

		self::assertSame( $original_totals, $recomputed_from_snapshot );

		// Meanwhile, computing fresh against the corrected data (what a
		// still-draft plan would do) correctly reflects the correction.
		$fresh_totals = NutrientCalculator::calculate(
			array( array( 'nutrients' => $version_b, 'quantity_grams' => 150.0 ) )
		);

		self::assertNotSame( $original_totals[ self::ENERGY ], $fresh_totals[ self::ENERGY ] );
	}

	// -----------------------------------------------------------------
	// merge_totals
	// -----------------------------------------------------------------

	public function test_merge_totals_combines_disjoint_nutrient_sets(): void {
		$merged = NutrientCalculator::merge_totals(
			array(
				array( self::ENERGY => 100 ),
				array( self::PROTEIN => 50 ),
			)
		);

		self::assertSame( array( self::ENERGY => 100, self::PROTEIN => 50 ), $merged );
	}

	public function test_merge_totals_of_empty_list_is_empty(): void {
		self::assertSame( array(), NutrientCalculator::merge_totals( array() ) );
	}

	// -----------------------------------------------------------------
	// Fixtures — hand-verifiable, realistic per-100g profiles
	// -----------------------------------------------------------------

	/**
	 * @return array<int, array{amount_per_100g: float}>
	 */
	private static function chicken_breast_per_100g(): array {
		return array(
			self::ENERGY  => array( 'amount_per_100g' => 165.0 ),
			self::PROTEIN => array( 'amount_per_100g' => 31.0 ),
			self::FAT     => array( 'amount_per_100g' => 3.6 ),
			self::CARBS   => array( 'amount_per_100g' => 0.0 ),
		);
	}

	/**
	 * @return array<int, array{amount_per_100g: float}>
	 */
	private static function white_rice_per_100g(): array {
		return array(
			self::ENERGY  => array( 'amount_per_100g' => 130.0 ),
			self::PROTEIN => array( 'amount_per_100g' => 2.7 ),
			self::FAT     => array( 'amount_per_100g' => 0.3 ),
			self::CARBS   => array( 'amount_per_100g' => 28.0 ),
		);
	}
}
