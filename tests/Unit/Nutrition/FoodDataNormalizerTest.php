<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit\Nutrition;

use MeroDiet\Nutrition\FoodDataNormalizer;
use MeroDiet\Tests\TestCase;

/**
 * Every fixture here mirrors the actual shape confirmed against the
 * live FoodData Central API (see FoodDataNormalizer's class docblock
 * for the quirks being guarded against) — not guessed at from
 * documentation prose.
 */
final class FoodDataNormalizerTest extends TestCase {

	private const ENERGY  = 1008;
	private const PROTEIN = 1003;

	// -----------------------------------------------------------------
	// Point 1: reference amount varies by food type
	// -----------------------------------------------------------------

	public function test_food_without_serving_size_is_treated_as_already_per_100g(): void {
		$raw = array(
			'fdcId'         => 323604,
			'description'   => 'Egg, whole, raw, frozen, pasteurized',
			'dataType'      => 'Foundation',
			// No servingSize field at all — matches live Foundation-food behavior.
			'foodNutrients' => array(
				self::nutrient_row( self::ENERGY, 'Energy', 'KCAL', 148.0 ),
				self::nutrient_row( self::PROTEIN, 'Protein', 'G', 12.5 ),
			),
		);

		$normalized = FoodDataNormalizer::normalize( $raw );

		self::assertNotNull( $normalized );
		self::assertSame( 148.0, $normalized['nutrients'][ self::ENERGY ]['amount_per_100g'] );
		self::assertSame( 12.5, $normalized['nutrients'][ self::PROTEIN ]['amount_per_100g'] );
	}

	public function test_branded_food_with_gram_serving_size_is_scaled_to_per_100g(): void {
		// 31.2 g serving reporting 6.41 g protein -> per-100g: 6.41 / 31.2 * 100.
		$raw = array(
			'fdcId'           => 2575290,
			'description'     => 'EGG',
			'dataType'        => 'Branded',
			'servingSize'     => 31.2,
			'servingSizeUnit' => 'GRM',
			'foodNutrients'   => array(
				self::nutrient_row( self::PROTEIN, 'Protein', 'G', 6.41 ),
			),
		);

		$normalized = FoodDataNormalizer::normalize( $raw );

		self::assertNotNull( $normalized );
		self::assertEqualsWithDelta( 20.5449, $normalized['nutrients'][ self::PROTEIN ]['amount_per_100g'], 0.001 );
	}

	public function test_lowercase_gram_unit_is_also_accepted(): void {
		$raw = array(
			'fdcId'           => 1,
			'description'     => 'Test food',
			'dataType'        => 'Branded',
			'servingSize'     => 50.0,
			'servingSizeUnit' => 'g',
			'foodNutrients'   => array(
				self::nutrient_row( self::ENERGY, 'Energy', 'KCAL', 100.0 ),
			),
		);

		$normalized = FoodDataNormalizer::normalize( $raw );

		self::assertNotNull( $normalized );
		self::assertSame( 200.0, $normalized['nutrients'][ self::ENERGY ]['amount_per_100g'] ); // 100 / 50 * 100.
	}

	// -----------------------------------------------------------------
	// Point 2: non-gram serving units can't be safely converted
	// -----------------------------------------------------------------

	public function test_non_gram_serving_unit_returns_null(): void {
		$raw = array(
			'fdcId'           => 2,
			'description'     => 'Test beverage',
			'dataType'        => 'Branded',
			'servingSize'     => 240.0,
			'servingSizeUnit' => 'MLT', // Millilitres — can't convert to per-100g by mass.
			'foodNutrients'   => array(
				self::nutrient_row( self::ENERGY, 'Energy', 'KCAL', 100.0 ),
			),
		);

		self::assertNull( FoodDataNormalizer::normalize( $raw ) );
	}

	public function test_zero_serving_size_returns_null(): void {
		$raw = array(
			'fdcId'           => 3,
			'description'     => 'Malformed entry',
			'dataType'        => 'Branded',
			'servingSize'     => 0,
			'servingSizeUnit' => 'GRM',
			'foodNutrients'   => array(),
		);

		self::assertNull( FoodDataNormalizer::normalize( $raw ) );
	}

	public function test_negative_serving_size_returns_null(): void {
		$raw = array(
			'fdcId'           => 4,
			'description'     => 'Malformed entry',
			'dataType'        => 'Branded',
			'servingSize'     => -10,
			'servingSizeUnit' => 'GRM',
			'foodNutrients'   => array(),
		);

		self::assertNull( FoodDataNormalizer::normalize( $raw ) );
	}

	public function test_non_numeric_serving_size_returns_null(): void {
		$raw = array(
			'fdcId'           => 5,
			'description'     => 'Malformed entry',
			'dataType'        => 'Branded',
			'servingSize'     => 'not-a-number',
			'servingSizeUnit' => 'GRM',
			'foodNutrients'   => array(),
		);

		self::assertNull( FoodDataNormalizer::normalize( $raw ) );
	}

	// -----------------------------------------------------------------
	// Point 3: energy nutrient ID precedence
	// -----------------------------------------------------------------

	public function test_resolve_energy_prefers_1008_when_present(): void {
		$nutrients = array(
			1008 => array( 'name' => 'Energy', 'unit' => 'KCAL', 'amount_per_100g' => 200.0 ),
			2047 => array( 'name' => 'Energy (Atwater General Factors)', 'unit' => 'KCAL', 'amount_per_100g' => 205.0 ),
		);

		self::assertSame( 200.0, FoodDataNormalizer::resolve_energy_kcal( $nutrients ) );
	}

	public function test_resolve_energy_falls_back_to_2047_when_1008_absent(): void {
		$nutrients = array(
			2047 => array( 'name' => 'Energy (Atwater General Factors)', 'unit' => 'KCAL', 'amount_per_100g' => 205.0 ),
			2048 => array( 'name' => 'Energy (Atwater Specific Factors)', 'unit' => 'KCAL', 'amount_per_100g' => 210.0 ),
		);

		self::assertSame( 205.0, FoodDataNormalizer::resolve_energy_kcal( $nutrients ) );
	}

	public function test_resolve_energy_falls_back_to_2048_when_1008_and_2047_absent(): void {
		$nutrients = array(
			2048 => array( 'name' => 'Energy (Atwater Specific Factors)', 'unit' => 'KCAL', 'amount_per_100g' => 210.0 ),
		);

		self::assertSame( 210.0, FoodDataNormalizer::resolve_energy_kcal( $nutrients ) );
	}

	public function test_resolve_energy_returns_null_when_no_energy_value_present(): void {
		$nutrients = array(
			self::PROTEIN => array( 'name' => 'Protein', 'unit' => 'G', 'amount_per_100g' => 5.0 ),
		);

		self::assertNull( FoodDataNormalizer::resolve_energy_kcal( $nutrients ) );
	}

	// -----------------------------------------------------------------
	// Point 4: category header rows (amount: null) must be filtered out
	// -----------------------------------------------------------------

	public function test_category_header_rows_are_filtered_out(): void {
		$raw = array(
			'fdcId'         => 6,
			'description'   => 'Test food',
			'dataType'      => 'Foundation',
			'foodNutrients' => array(
				array(
					'nutrient' => array( 'id' => 9999, 'name' => 'Proximates', 'unitName' => '' ),
					'amount'   => null, // Category header — no real value.
				),
				self::nutrient_row( self::PROTEIN, 'Protein', 'G', 10.0 ),
			),
		);

		$normalized = FoodDataNormalizer::normalize( $raw );

		self::assertNotNull( $normalized );
		self::assertArrayNotHasKey( 9999, $normalized['nutrients'] );
		self::assertArrayHasKey( self::PROTEIN, $normalized['nutrients'] );
	}

	public function test_malformed_rows_are_skipped_without_error(): void {
		$raw = array(
			'fdcId'         => 7,
			'description'   => 'Test food',
			'dataType'      => 'Foundation',
			'foodNutrients' => array(
				array( 'not_a_nutrient_row' => true ),
				array( 'nutrient' => array( 'name' => 'Missing ID' ), 'amount' => 5.0 ),
				self::nutrient_row( self::PROTEIN, 'Protein', 'G', 10.0 ),
			),
		);

		$normalized = FoodDataNormalizer::normalize( $raw );

		self::assertNotNull( $normalized );
		self::assertCount( 1, $normalized['nutrients'] );
		self::assertArrayHasKey( self::PROTEIN, $normalized['nutrients'] );
	}

	public function test_branded_food_with_no_parseable_nutrient_rows_returns_null(): void {
		// A real USDA quirk: some Branded foods' foodNutrients rows are
		// bare {type, id, amount} — no nested `nutrient` identity object
		// at all — so every row is structurally unparseable. This must
		// return null, not a "resolved" food with an empty nutrients
		// array, since the latter would silently corrupt any recipe or
		// plan built on it.
		$raw = array(
			'fdcId'         => 9,
			'description'   => 'Sparse branded food',
			'dataType'      => 'Branded',
			'foodNutrients' => array(
				array( 'type' => 'FoodNutrient', 'id' => 26941390, 'amount' => 165.0 ),
				array( 'type' => 'FoodNutrient', 'id' => 26941394, 'amount' => 0.38 ),
			),
		);

		self::assertNull( FoodDataNormalizer::normalize( $raw ) );
	}

	public function test_missing_food_nutrients_key_produces_empty_nutrients(): void {
		$raw = array(
			'fdcId'       => 8,
			'description' => 'Test food',
			'dataType'    => 'Foundation',
		);

		$normalized = FoodDataNormalizer::normalize( $raw );

		self::assertNotNull( $normalized );
		self::assertSame( array(), $normalized['nutrients'] );
	}

	// -----------------------------------------------------------------
	// Output shape
	// -----------------------------------------------------------------

	public function test_normalize_returns_source_usda_and_source_id_from_fdc_id(): void {
		$raw = array(
			'fdcId'         => 12345,
			'description'   => 'Test food',
			'dataType'      => 'Foundation',
			'foodNutrients' => array(),
		);

		$normalized = FoodDataNormalizer::normalize( $raw );

		self::assertSame( 'usda', $normalized['source'] );
		self::assertSame( 12345, $normalized['source_id'] );
		self::assertSame( 'Test food', $normalized['description'] );
		self::assertSame( 'Foundation', $normalized['data_type'] );
	}

	/**
	 * Build one raw foodNutrients row in the shape the real API returns.
	 */
	private static function nutrient_row( int $id, string $name, string $unit, float $amount ): array {
		return array(
			'nutrient' => array(
				'id'       => $id,
				'name'     => $name,
				'unitName' => $unit,
			),
			'amount'   => $amount,
		);
	}
}
