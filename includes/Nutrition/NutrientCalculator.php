<?php
/**
 * The nutrient aggregation engine.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Nutrition;

/**
 * Pure, WordPress-free, deterministic. This is the credibility core of
 * the whole product — a clinically-trained buyer will judge MeroDiet
 * entirely on whether these numbers are right, so every design choice
 * here favours correctness and auditability over convenience.
 *
 * **Integer minor units, never floats.** Every nutrient amount is
 * converted to "milli-units" (native unit × 1000, rounded to the
 * nearest integer) before any arithmetic happens, and totals are
 * accumulated with integer addition. This isn't about minimizing
 * rounding error (rounding per line item can't beat rounding once at
 * the end for raw accuracy) — it's about determinism: float addition
 * in PHP is not guaranteed bit-for-bit reproducible across runs the way
 * integer addition is, and a clinical tool where "why did this total
 * change by 0.00000003" is not a good conversation to have with a
 * dietitian. One uniform ×1000 scale is used for every nutrient
 * regardless of its native unit (grams, milligrams, micrograms, kcal)
 * rather than a per-nutrient unit table — simpler, and the precision
 * loss (a thousandth of a gram or calorie) is negligible next to the
 * inherent imprecision of both food-composition databases and
 * self-reported client quantities.
 *
 * Callers convert back to a human-readable amount with
 * from_minor_units() only at the point of display — the minor-unit
 * value is what gets stored (e.g. in a plan's nutrient_snapshot).
 */
final class NutrientCalculator {

	private const SCALE = 1000;

	/**
	 * Convert a native-unit amount (grams, mg, µg, kcal — whatever the
	 * nutrient's own unit is) into this engine's integer minor unit.
	 *
	 * @param float $amount Amount in the nutrient's native unit.
	 */
	public static function to_minor_units( float $amount ): int {
		return (int) round( $amount * self::SCALE );
	}

	/**
	 * Convert an integer minor-unit amount back to its native unit for display.
	 *
	 * @param int $minor_units Amount in integer minor units.
	 */
	public static function from_minor_units( int $minor_units ): float {
		return $minor_units / self::SCALE;
	}

	/**
	 * Sum nutrient totals across a flat list of line items.
	 *
	 * Each line item is already fully resolved to a specific food's
	 * per-100g nutrient profile and a quantity in grams — recipe
	 * expansion (a recipe's items, scaled by however many servings)
	 * happens in a caller before reaching this method, keeping this
	 * engine itself free of any notion of "recipe" or "plan".
	 *
	 * @param array<int, array{nutrients: array<int, array{amount_per_100g: float}>, quantity_grams: float}> $line_items Resolved food + quantity pairs.
	 *
	 * @return array<int, int> nutrient_id => total, in integer minor units.
	 */
	public static function calculate( array $line_items ): array {
		$totals = array();

		foreach ( $line_items as $item ) {
			$quantity_grams = $item['quantity_grams'];

			foreach ( $item['nutrients'] as $nutrient_id => $nutrient ) {
				$amount_for_quantity = $nutrient['amount_per_100g'] * $quantity_grams / 100.0;
				$contribution        = self::to_minor_units( $amount_for_quantity );

				$totals[ $nutrient_id ] = ( $totals[ $nutrient_id ] ?? 0 ) + $contribution;
			}
		}

		return $totals;
	}

	/**
	 * Scale a recipe's own totals (computed via calculate() over its
	 * recipe_items) down to a per-serving profile, then further by how
	 * many servings a plan item actually calls for.
	 *
	 * @param array<int, int> $recipe_totals    Output of calculate() over the recipe's full ingredient list, in minor units.
	 * @param int             $recipe_servings  How many servings the recipe as a whole makes. Must be >= 1.
	 * @param float           $servings_wanted  How many of those servings this plan item calls for (may be fractional, e.g. 0.5).
	 *
	 * @return array<int, int> nutrient_id => total for the requested servings, in minor units.
	 *
	 * @throws \InvalidArgumentException If $recipe_servings is less than 1.
	 */
	public static function scale_recipe_totals( array $recipe_totals, int $recipe_servings, float $servings_wanted ): array {
		if ( $recipe_servings < 1 ) {
			throw new \InvalidArgumentException( 'recipe_servings must be at least 1.' );
		}

		$ratio  = $servings_wanted / $recipe_servings;
		$scaled = array();

		foreach ( $recipe_totals as $nutrient_id => $total ) {
			$scaled[ $nutrient_id ] = (int) round( $total * $ratio );
		}

		return $scaled;
	}

	/**
	 * Merge multiple already-computed totals (minor units) together —
	 * e.g. combining several plan items' totals into a day's total, or
	 * several days into a plan's overall total.
	 *
	 * @param array<int, array<int, int>> $totals_list List of nutrient_id => amount maps, each in minor units.
	 *
	 * @return array<int, int>
	 */
	public static function merge_totals( array $totals_list ): array {
		$merged = array();

		foreach ( $totals_list as $totals ) {
			foreach ( $totals as $nutrient_id => $amount ) {
				$merged[ $nutrient_id ] = ( $merged[ $nutrient_id ] ?? 0 ) + $amount;
			}
		}

		return $merged;
	}
}
