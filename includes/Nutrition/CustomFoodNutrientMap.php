<?php
/**
 * Curated nutrient set for hand-entered custom foods.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Nutrition;

/**
 * USDA foods can carry 50+ nutrients per record (see
 * FoodDataNormalizer); a manual-entry form exposing that many fields
 * would be unusable for a practitioner hand-entering a homemade dish
 * or branded product. This is the smaller, clinically-relevant subset
 * offered instead — still stored using USDA's own nutrient IDs, so a
 * custom food totals identically to a USDA food anywhere nutrients are
 * summed (RecipeNutrientResolver, PlanNutrientResolver, etc. are
 * already source-agnostic — see FoodCache::find()).
 *
 * Every field is optional except the food's name itself: a blank field
 * means "not entered", not zero, matching how USDA foods that omit a
 * nutrient are already treated everywhere else in the app.
 */
final class CustomFoodNutrientMap {

	/**
	 * USDA nutrient ID => {request field key, display name, unit}.
	 *
	 * @var array<int, array{key:string, name:string, unit:string}>
	 */
	private const NUTRIENTS = array(
		1008 => array(
			'key'  => 'calories',
			'name' => 'Energy',
			'unit' => 'KCAL',
		),
		1003 => array(
			'key'  => 'protein',
			'name' => 'Protein',
			'unit' => 'G',
		),
		1005 => array(
			'key'  => 'carbs',
			'name' => 'Carbohydrate, by difference',
			'unit' => 'G',
		),
		1004 => array(
			'key'  => 'fat',
			'name' => 'Total lipid (fat)',
			'unit' => 'G',
		),
		1258 => array(
			'key'  => 'saturated_fat',
			'name' => 'Fatty acids, total saturated',
			'unit' => 'G',
		),
		1079 => array(
			'key'  => 'fiber',
			'name' => 'Fiber, total dietary',
			'unit' => 'G',
		),
		2000 => array(
			'key'  => 'sugar',
			'name' => 'Sugars, total',
			'unit' => 'G',
		),
		1093 => array(
			'key'  => 'sodium',
			'name' => 'Sodium, Na',
			'unit' => 'MG',
		),
		1253 => array(
			'key'  => 'cholesterol',
			'name' => 'Cholesterol',
			'unit' => 'MG',
		),
		1092 => array(
			'key'  => 'potassium',
			'name' => 'Potassium, K',
			'unit' => 'MG',
		),
		1087 => array(
			'key'  => 'calcium',
			'name' => 'Calcium, Ca',
			'unit' => 'MG',
		),
		1089 => array(
			'key'  => 'iron',
			'name' => 'Iron, Fe',
			'unit' => 'MG',
		),
		1162 => array(
			'key'  => 'vitamin_c',
			'name' => 'Vitamin C, total ascorbic acid',
			'unit' => 'MG',
		),
		1114 => array(
			'key'  => 'vitamin_d',
			'name' => 'Vitamin D (D2 + D3)',
			'unit' => 'UG',
		),
	);

	/**
	 * The request field keys this map accepts, e.g. for REST arg schemas.
	 *
	 * @return string[]
	 */
	public static function field_keys(): array {
		return array_column( self::NUTRIENTS, 'key' );
	}

	/**
	 * Build the canonical {nutrient_id: {name, unit, amount_per_100g}}
	 * shape (see FoodDataNormalizer) from flat request fields. A field
	 * that is missing or null is omitted entirely — not stored as 0 —
	 * so it's indistinguishable from a USDA food that doesn't report
	 * that nutrient.
	 *
	 * @param array<string, mixed> $fields Flat fields keyed by field_keys(), e.g. ['calories' => 120, ...].
	 *
	 * @return array<int, array{name:string, unit:string, amount_per_100g:float}>
	 */
	public static function to_nutrients( array $fields ): array {
		$nutrients = array();

		foreach ( self::NUTRIENTS as $id => $definition ) {
			$value = $fields[ $definition['key'] ] ?? null;

			if ( null === $value || '' === $value ) {
				continue;
			}

			$nutrients[ $id ] = array(
				'name'            => $definition['name'],
				'unit'            => $definition['unit'],
				'amount_per_100g' => (float) $value,
			);
		}

		return $nutrients;
	}

	/**
	 * The inverse of to_nutrients() — flattens a stored nutrients map
	 * back to field keys, for returning a custom food to the edit form.
	 *
	 * @param array<int, array{name:string, unit:string, amount_per_100g:float}> $nutrients Stored nutrients map.
	 *
	 * @return array<string, float>
	 */
	public static function to_fields( array $nutrients ): array {
		$fields = array();

		foreach ( self::NUTRIENTS as $id => $definition ) {
			if ( isset( $nutrients[ $id ] ) ) {
				$fields[ $definition['key'] ] = $nutrients[ $id ]['amount_per_100g'];
			}
		}

		return $fields;
	}
}
