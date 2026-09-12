export interface Client {
	id: number;
	practitioner_user_id: number;
	user_id: number | null;
	first_name: string;
	last_name: string;
	email: string;
	goals: string | null;
	dietary_restrictions: string | null;
	allergies: string[];
	status: 'active' | 'paused';
	created_at: string;
	updated_at: string;
}

export type ClientInput = Pick< Client, 'first_name' | 'last_name' | 'email' > & {
	allergies?: string[];
};

/** Nutrient amounts keyed by USDA nutrient ID, e.g. { "1008": 165 } for kcal. */
export type NutrientTotals = Record< string, number >;

export interface RecipeItem {
	id: number;
	food_id: number;
	quantity_grams: number;
	food_description: string | null;
}

export interface Recipe {
	id: number;
	practitioner_user_id: number;
	name: string;
	description: string | null;
	servings: number;
	items: RecipeItem[];
	nutrient_totals_per_serving: NutrientTotals;
	created_at: string;
	updated_at: string;
}

export interface RecipeItemInput {
	food_id: number;
	quantity_grams: number;
}

export interface RecipeInput {
	name: string;
	description?: string;
	servings?: number;
	items: RecipeItemInput[];
}

/** A resolved food's per-100g nutrient profile — the shape FoodDataService::resolve() returns. */
export interface ResolvedFood {
	id: number;
	source: string;
	source_id: number;
	description: string;
	data_type: string;
	nutrients: Record< string, { name: string; unit: string; amount_per_100g: number } >;
}

/** One row from GET /foods/search — the raw USDA search result shape. */
export interface FoodSearchResult {
	fdcId: number;
	description: string;
	dataType: string;
}

declare global {
	interface Window {
		nutrioAdmin?: {
			restUrl?: string;
			restNonce?: string;
			mountId?: string;
			adminUrl?: string;
			currentUserName?: string;
			currentUserInitials?: string;
		};
	}
}
