import { __ } from '@wordpress/i18n';
import type { MealType, PlanItem } from '../types';

// Shared between PlanTab and LogTab so both group/label/icon meals
// identically rather than drifting out of sync between two copies.
export const MEAL_ORDER: MealType[] = [
	'breakfast',
	'lunch',
	'dinner',
	'snack',
];

export const MEAL_LABELS: Record< MealType, string > = {
	breakfast: __( 'Breakfast', 'nutrio' ),
	lunch: __( 'Lunch', 'nutrio' ),
	dinner: __( 'Dinner', 'nutrio' ),
	snack: __( 'Snack', 'nutrio' ),
};

export const MEAL_ICONS: Record< MealType, JSX.Element > = {
	breakfast: (
		<>
			<path d="M6 3v4M10 3v4M14 3v4" />
			<path d="M5 9h14l-1.5 10.5A2 2 0 0 1 15.5 21h-7a2 2 0 0 1-2-1.5L5 9Z" />
		</>
	),
	lunch: (
		<>
			<path d="M12 3a7 7 0 0 0-7 7c0 3 2 5 2 7a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2c0-2 2-4 2-7a7 7 0 0 0-7-7Z" />
		</>
	),
	dinner: (
		<>
			<path d="M4 4v6a2 2 0 0 0 2 2v9M4 4v0M4 8h4M8 4v6a2 2 0 0 1-2 2M16 4a3 3 0 0 0-3 3v4a2 2 0 0 0 2 2v8M18 4v15" />
		</>
	),
	snack: (
		<>
			<circle cx="12" cy="12" r="9" />
			<path d="M12 7v5l3 3" />
		</>
	),
};

export function itemsByMeal(
	items: PlanItem[]
): Partial< Record< MealType, PlanItem[] > > {
	const grouped: Partial< Record< MealType, PlanItem[] > > = {};

	for ( const item of items ) {
		( grouped[ item.meal_type ] ??= [] ).push( item );
	}

	return grouped;
}

// "150 g" for a food item, "2 srv" for a recipe item — same convention the
// practitioner's own Plan builder uses for quantity/servings inputs.
export function itemQuantityLabel( item: PlanItem ): string | null {
	if ( item.food_id ) {
		return null === item.quantity_grams
			? null
			: `${ item.quantity_grams } ${ __( 'g', 'nutrio' ) }`;
	}

	return null === item.servings
		? null
		: `${ item.servings } ${ __( 'srv', 'nutrio' ) }`;
}
