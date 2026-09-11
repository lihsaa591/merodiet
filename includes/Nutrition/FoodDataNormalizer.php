<?php
/**
 * USDA FoodData Central response normalizer.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Nutrition;

/**
 * Turns a raw FoodData Central `/food/{fdcId}` response into the flat,
 * per-100g, always-in-the-same-shape structure every other part of
 * Nutrio deals with. Deliberately pure — no WordPress functions, no
 * HTTP — so every quirk below is unit-testable with plain fixtures.
 *
 * USDA's API has several quirks that would silently corrupt every
 * downstream calculation if not handled here, once, in one place:
 *
 * 1. **Reference amount varies by food type.** Foods without a
 *    `servingSize` field (Foundation, SR Legacy, Survey/FNDDS) report
 *    nutrients per 100 g. Foods WITH a `servingSize` field (Branded)
 *    report nutrients per serving and must be scaled to per-100g.
 *    Detecting this structurally (does `servingSize` exist?) rather
 *    than trusting the `dataType` string is deliberate — it's the more
 *    robust signal.
 *
 * 2. **Serving size isn't always in grams.** A Branded food with
 *    `servingSizeUnit` other than grams (e.g. millilitres) can't be
 *    safely converted to per-100g by mass without a density figure
 *    USDA doesn't provide. normalize() returns null for these rather
 *    than guess — a food we can't cache correctly is better than one
 *    cached wrong.
 *
 * 3. **"Energy" isn't always nutrient ID 1008.** Some Foundation foods
 *    omit 1008 entirely and only report the Atwater-factor variants
 *    (2047 "General Factors", 2048 "Specific Factors"). Precedence:
 *    1008 if present, else 2047, else 2048, else the food has no
 *    energy value at all (rare, but possible for e.g. water).
 *
 * 4. **Category header rows have no value.** Rows like "Proximates"
 *    exist purely to group other rows in USDA's own UI and carry
 *    `amount: null` — these must be filtered out, not treated as a
 *    zero-value nutrient.
 *
 * 5. **Some Branded foods omit nutrient identity entirely.** Foundation/
 *    SR Legacy rows always nest `{nutrient: {id, name, unitName}, amount}`.
 *    Some Branded foods' `/food/{fdcId}` rows are instead bare
 *    `{type, id, amount}` — no nutrient id, name, or unit at all — making
 *    per-nutrient parsing structurally impossible. normalize() returns
 *    null in this case rather than cache a "resolved" food with zero
 *    nutrients, which would silently corrupt any recipe/plan built on it.
 */
final class FoodDataNormalizer {

	/**
	 * Nutrient ID precedence for energy, most-preferred first — see
	 * class docblock point 3.
	 *
	 * @var int[]
	 */
	private const ENERGY_NUTRIENT_IDS = array( 1008, 2047, 2048 );

	/**
	 * Normalize one food's raw FoodData Central detail response.
	 *
	 * @param array<string, mixed> $raw Raw response body from GET /food/{fdcId}.
	 *
	 * @return array{source:string, source_id:int, description:string, data_type:string, nutrients:array<int, array{name:string, unit:string, amount_per_100g:float}>}|null
	 *         Null if the food cannot be reliably normalized (see point 2 above).
	 */
	public static function normalize( array $raw ): ?array {
		$scale = self::per_100g_scale_factor( $raw );

		if ( null === $scale ) {
			return null;
		}

		$nutrients = array();

		foreach ( (array) ( $raw['foodNutrients'] ?? array() ) as $row ) {
			$parsed = self::parse_nutrient_row( $row );

			if ( null === $parsed ) {
				continue; // Category header row, or malformed — see point 4.
			}

			array_push(
				$nutrients,
				array(
					'id'     => $parsed['id'],
					'name'   => $parsed['name'],
					'unit'   => $parsed['unit'],
					'amount' => $parsed['amount'] * $scale,
				)
			);
		}

		if ( array() === $nutrients && array() !== (array) ( $raw['foodNutrients'] ?? array() ) ) {
			// Every row failed to parse — some Branded foods report
			// foodNutrients without the nested `nutrient` identity object
			// (just a bare FoodNutrient id + amount), which makes
			// per-nutrient parsing structurally impossible. A "resolved"
			// food with zero nutrients would silently corrupt any recipe
			// or plan built on it, so this is unnormalizable — same as
			// point 2's non-gram serving size case.
			return null;
		}

		$by_id = array();
		foreach ( $nutrients as $nutrient ) {
			$by_id[ $nutrient['id'] ] = array(
				'name'            => $nutrient['name'],
				'unit'            => $nutrient['unit'],
				'amount_per_100g' => $nutrient['amount'],
			);
		}

		return array(
			'source'      => 'usda',
			'source_id'   => (int) ( $raw['fdcId'] ?? 0 ),
			'description' => (string) ( $raw['description'] ?? '' ),
			'data_type'   => (string) ( $raw['dataType'] ?? '' ),
			'nutrients'   => $by_id,
		);
	}

	/**
	 * Resolve the single energy value to use, applying the precedence
	 * documented in the class docblock (point 3).
	 *
	 * @param array<int, array{name:string, unit:string, amount_per_100g:float}> $nutrients Normalized nutrient map, keyed by nutrient ID.
	 *
	 * @return float|null Kcal per 100g, or null if no energy value is present at all.
	 */
	public static function resolve_energy_kcal( array $nutrients ): ?float {
		foreach ( self::ENERGY_NUTRIENT_IDS as $nutrient_id ) {
			if ( isset( $nutrients[ $nutrient_id ] ) ) {
				return $nutrients[ $nutrient_id ]['amount_per_100g'];
			}
		}

		return null;
	}

	/**
	 * Determine the multiplier to convert this food's raw nutrient
	 * amounts into per-100g values.
	 *
	 * @param array<string, mixed> $raw Raw food response.
	 *
	 * @return float|null 1.0 if already per-100g; a scale factor if a
	 *                     gram-based serving size is present; null if the
	 *                     food cannot be reliably normalized.
	 */
	private static function per_100g_scale_factor( array $raw ): ?float {
		if ( ! isset( $raw['servingSize'] ) ) {
			return 1.0; // No serving size at all — already per-100g (point 1).
		}

		$serving_size = $raw['servingSize'];
		$unit         = strtoupper( (string) ( $raw['servingSizeUnit'] ?? '' ) );

		if ( ! is_numeric( $serving_size ) || (float) $serving_size <= 0.0 ) {
			return null;
		}

		if ( 'GRM' !== $unit && 'G' !== $unit ) {
			return null; // Non-gram serving unit — can't convert by mass (point 2).
		}

		return 100.0 / (float) $serving_size;
	}

	/**
	 * Parse a single raw foodNutrients row.
	 *
	 * @param mixed $row One entry from the raw foodNutrients array.
	 *
	 * @return array{id:int, name:string, unit:string, amount:float}|null Null for a category-header row or malformed entry.
	 */
	private static function parse_nutrient_row( mixed $row ): ?array {
		if ( ! is_array( $row ) || ! isset( $row['nutrient'] ) || ! is_array( $row['nutrient'] ) ) {
			return null;
		}

		$amount = $row['amount'] ?? null;

		if ( ! is_numeric( $amount ) ) {
			return null; // Category header row (point 4), or missing value.
		}

		$id = $row['nutrient']['id'] ?? null;

		if ( ! is_numeric( $id ) ) {
			return null;
		}

		return array(
			'id'     => (int) $id,
			'name'   => (string) ( $row['nutrient']['name'] ?? '' ),
			'unit'   => (string) ( $row['nutrient']['unitName'] ?? '' ),
			'amount' => (float) $amount,
		);
	}
}
