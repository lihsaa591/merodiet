import type { NutrientTotals } from '../types';

// Same precedence FoodDataNormalizer uses server-side: 1008 (Energy) is
// preferred, falling back to the Atwater-factor variants some Foundation
// foods report instead. See that class's docblock for the full rationale.
const ENERGY_IDS = [ '1008', '2047', '2048' ];
const PROTEIN_ID = '1003';
const FAT_ID = '1004';
const CARBS_ID = '1005';

/** Backend stores nutrient amounts as integers scaled x1000 (never floats,
 *  for deterministic math) — this un-scales one value for display. */
function unscale( amount: number | undefined ): number | null {
	return amount === undefined ? null : amount / 1000;
}

export interface NutrientSummary {
	kcal: number | null;
	protein: number | null;
	carbs: number | null;
	fat: number | null;
}

/**
 * Not every food reports every macro (some USDA entries genuinely lack
 * protein/fat/carb/energy values) — callers must handle `null` rather than
 * assume these are always present.
 */
export function summarizeNutrients( totals: NutrientTotals ): NutrientSummary {
	const energyId = ENERGY_IDS.find( ( id ) => totals[ id ] !== undefined );

	return {
		kcal: energyId ? unscale( totals[ energyId ] ) : null,
		protein: unscale( totals[ PROTEIN_ID ] ),
		carbs: unscale( totals[ CARBS_ID ] ),
		fat: unscale( totals[ FAT_ID ] ),
	};
}

export function formatAmount( value: number | null, unit: string = 'g' ): string {
	return value === null ? '—' : `${ Math.round( value * 10 ) / 10 }${ unit }`;
}
