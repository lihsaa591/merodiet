import type { NutrientTotals, RecipeItem } from '../types';

// Same precedence FoodDataNormalizer uses server-side: 1008 (Energy) is
// preferred, falling back to the Atwater-factor variants some Foundation
// foods report instead. See that class's docblock for the full rationale.
const ENERGY_IDS = [ '1008', '2047', '2048' ];
const PROTEIN_ID = '1003';
const FAT_ID = '1004';
const CARBS_ID = '1005';

// Backend stores nutrient amounts as integers scaled x1000 (never floats,
// for deterministic math) — this un-scales one value for display.
function unscale( amount: number | undefined ): number | null {
	return amount === undefined ? null : amount / 1000;
}

export interface NutrientSummary {
	kcal: number | null;
	protein: number | null;
	carbs: number | null;
	fat: number | null;
}

// Not every food reports every macro (some USDA entries genuinely lack
// protein/fat/carb/energy values) — callers must handle `null` rather than
// assume these are always present.
export function summarizeNutrients( totals: NutrientTotals ): NutrientSummary {
	const energyId = ENERGY_IDS.find( ( id ) => totals[ id ] !== undefined );

	return {
		kcal: energyId ? unscale( totals[ energyId ] ) : null,
		protein: unscale( totals[ PROTEIN_ID ] ),
		carbs: unscale( totals[ CARBS_ID ] ),
		fat: unscale( totals[ FAT_ID ] ),
	};
}

// Live estimate from in-progress ingredients, ahead of the server's
// save-computed totals. Nutrients here are raw per-100g values, not
// x1000-scaled like the backend's storage format, so no unscale() needed.
export function estimateNutrientsPerServing(
	items: Pick< RecipeItem, 'quantity_grams' | 'nutrients' >[],
	servings: number
): NutrientSummary {
	const totals: Record< string, number > = {};

	for ( const item of items ) {
		for ( const [ nutrientId, nutrient ] of Object.entries(
			item.nutrients
		) ) {
			totals[ nutrientId ] =
				( totals[ nutrientId ] ?? 0 ) +
				( nutrient.amount_per_100g * item.quantity_grams ) / 100;
		}
	}

	const energyId = ENERGY_IDS.find( ( id ) => totals[ id ] !== undefined );
	const perServing = ( value: number | undefined ): number | null =>
		value === undefined ? null : value / Math.max( 1, servings );

	return {
		kcal: energyId ? perServing( totals[ energyId ] ) : null,
		protein: perServing( totals[ PROTEIN_ID ] ),
		carbs: perServing( totals[ CARBS_ID ] ),
		fat: perServing( totals[ FAT_ID ] ),
	};
}

interface DayFoodItem {
	kind: 'food';
	quantity_grams: number;
	nutrients: Record< string, { amount_per_100g: number } >;
}

interface DayRecipeItem {
	kind: 'recipe';
	servings: number;
	nutrient_totals_per_serving: NutrientTotals;
}

// Live estimate for one plan day, mixing direct-food items (scaled by
// grams, like a recipe's own ingredients) and recipe items (scaled by
// number of servings, using that recipe's own already-computed
// per-serving totals rather than re-deriving them from its ingredients).
export function estimateDayNutrients(
	items: ( DayFoodItem | DayRecipeItem )[]
): NutrientSummary {
	const totals: Record< string, number > = {};

	const add = ( nutrientId: string, amount: number ) => {
		totals[ nutrientId ] = ( totals[ nutrientId ] ?? 0 ) + amount;
	};

	for ( const item of items ) {
		if ( item.kind === 'food' ) {
			for ( const [ nutrientId, nutrient ] of Object.entries(
				item.nutrients
			) ) {
				add(
					nutrientId,
					( nutrient.amount_per_100g * item.quantity_grams ) / 100
				);
			}
		} else {
			for ( const [ nutrientId, amount ] of Object.entries(
				item.nutrient_totals_per_serving
			) ) {
				// nutrient_totals_per_serving is already ×1000-scaled like the
				// backend's storage format — unscale here, unlike the food
				// branch above, which works from raw per-100g values.
				add( nutrientId, ( amount / 1000 ) * item.servings );
			}
		}
	}

	const energyId = ENERGY_IDS.find( ( id ) => totals[ id ] !== undefined );

	return {
		kcal: energyId ? totals[ energyId ] : null,
		protein: totals[ PROTEIN_ID ] ?? null,
		carbs: totals[ CARBS_ID ] ?? null,
		fat: totals[ FAT_ID ] ?? null,
	};
}

export function formatAmount(
	value: number | null,
	unit: string = 'g'
): string {
	return value === null ? '—' : `${ Math.round( value * 10 ) / 10 }${ unit }`;
}
