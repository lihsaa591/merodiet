export type WeightUnit = 'kg' | 'lb';

const UNIT_STORAGE_KEY = 'nutrio-client-portal-weight-unit';

// Shared between MeasurementsTab (where the unit is chosen) and any other
// client-portal screen that displays a weight (e.g. the Dashboard tab) —
// one localStorage key and one conversion, not a copy per screen.
export function readStoredWeightUnit(): WeightUnit {
	try {
		const stored = window.localStorage.getItem( UNIT_STORAGE_KEY );
		return 'lb' === stored ? 'lb' : 'kg';
	} catch {
		return 'kg';
	}
}

export function storeWeightUnit( unit: WeightUnit ): void {
	try {
		window.localStorage.setItem( UNIT_STORAGE_KEY, unit );
	} catch {
		// Private browsing / blocked storage — the preference just won't persist.
	}
}

export function gramsToDisplay( grams: number, unit: WeightUnit ): number {
	return (
		Math.round( ( 'lb' === unit ? grams / 453.592 : grams / 1000 ) * 10 ) /
		10
	);
}

export function displayToGrams( value: number, unit: WeightUnit ): number {
	return Math.round( 'lb' === unit ? value * 453.592 : value * 1000 );
}
