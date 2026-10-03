// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from '@jest/globals';
import { itemQuantityLabel } from './mealMeta';
import type { PlanItem } from '../types';

const base: PlanItem = {
	id: 1,
	meal_type: 'snack',
	food_id: null,
	recipe_id: 3,
	quantity_grams: null,
	servings: 1,
	food_description: null,
	nutrients: null,
	recipe_name: 'Chicken Bowl',
	recipe_nutrient_totals_per_serving: null,
};

describe( 'itemQuantityLabel', () => {
	it( 'shows grams for a food item', () => {
		expect(
			itemQuantityLabel( {
				...base,
				food_id: 5,
				recipe_id: null,
				quantity_grams: 150,
				servings: null,
			} )
		).toBe( '150 g' );
	} );

	it( 'shows servings and the portion weight for a recipe item', () => {
		expect(
			itemQuantityLabel( { ...base, recipe_serving_grams: 350 } )
		).toBe( '1 srv · 350 g' );
	} );

	it( 'scales the weight by the number of servings', () => {
		expect(
			itemQuantityLabel( {
				...base,
				servings: 2.5,
				recipe_serving_grams: 175,
			} )
		).toBe( '2.5 srv · 437.5 g' );
	} );

	it( 'falls back to servings alone when the recipe has no weight', () => {
		expect( itemQuantityLabel( base ) ).toBe( '1 srv' );
		expect(
			itemQuantityLabel( { ...base, recipe_serving_grams: null } )
		).toBe( '1 srv' );
	} );

	it( 'returns null when there is no quantity at all', () => {
		expect( itemQuantityLabel( { ...base, servings: null } ) ).toBeNull();
	} );
} );
