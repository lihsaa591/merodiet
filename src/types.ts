export interface Client {
	id: number;
	practitioner_user_id: number;
	user_id: number | null;
	portal_status: 'not_invited' | 'invited' | 'active';
	avatar_id: number | null;
	avatar_url: string | null;
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

export type ClientInput = Pick<
	Client,
	'first_name' | 'last_name' | 'email'
> & {
	allergies?: string[];
	goals?: string;
	dietary_restrictions?: string;
	/** Not set by the create/edit form — only used for the bulk "Mark active"/"Mark paused" action. */
	status?: 'active' | 'paused';
	/** Create-only — provision the client's WP account and send the portal invite immediately. */
	send_invite?: boolean;
};

/** Nutrient amounts keyed by USDA nutrient ID, e.g. { "1008": 165 } for kcal. */
export type NutrientTotals = Record< string, number >;

/** The shape every paginated list endpoint (clients/recipes/plans) responds with. */
export interface PaginatedResponse< T > {
	items: T[];
	total: number;
	page: number;
	per_page: number;
	total_pages: number;
}

// Curated, optional nutrient fields a custom food can carry — see
// CustomFoodNutrientMap on the backend for the USDA-nutrient-ID mapping
// behind each one. Missing fields simply weren't entered, same as a USDA
// food that doesn't report a given nutrient.
export interface CustomFoodNutrientFields {
	calories?: number;
	protein?: number;
	carbs?: number;
	fat?: number;
	saturated_fat?: number;
	fiber?: number;
	sugar?: number;
	sodium?: number;
	cholesterol?: number;
	potassium?: number;
	calcium?: number;
	iron?: number;
	vitamin_c?: number;
	vitamin_d?: number;
}

export interface CustomFood extends CustomFoodNutrientFields {
	id: number;
	created_by: number;
	name: string;
	/** Raw nutrient-ID-keyed map — same shape as ResolvedFood['nutrients'], so a custom food can be added to a recipe like any USDA food. */
	nutrients: Record<
		string,
		{ name: string; unit: string; amount_per_100g: number }
	>;
	updated_at: string;
}

export type CustomFoodInput = CustomFoodNutrientFields & {
	name: string;
};

export interface RecipeItem {
	id: number;
	food_id: number;
	quantity_grams: number;
	food_description: string | null;
	nutrients: Record<
		string,
		{ name: string; unit: string; amount_per_100g: number }
	>;
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

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface PlanItem {
	id: number;
	meal_type: MealType;
	food_id: number | null;
	recipe_id: number | null;
	quantity_grams: number | null;
	servings: number | null;
	food_description: string | null;
	nutrients: Record<
		string,
		{ name: string; unit: string; amount_per_100g: number }
	> | null;
	recipe_name: string | null;
	recipe_nutrient_totals_per_serving: NutrientTotals | null;
	/** Grams in one serving of a recipe item (portal plan only). */
	recipe_serving_grams?: number | null;
}

export interface PlanDay {
	day_offset: number;
	items: PlanItem[];
}

export interface Plan {
	id: number;
	practitioner_user_id: number;
	client_id: number | null;
	/** Resolved by the plans list endpoint; null when unassigned (or the client no longer exists). */
	client?: Pick<
		Client,
		'id' | 'first_name' | 'last_name' | 'avatar_url'
	> | null;
	title: string;
	status: 'draft' | 'assigned';
	start_date: string;
	end_date: string;
	assigned_at: string | null;
	days: PlanDay[];
	/** Live for a draft (recomputed from current data), frozen for an assigned plan. day_offset => {nutrient_id: amount}. */
	nutrient_totals: Record< number, NutrientTotals >;
	created_at: string;
	updated_at: string;
}

/** GET /me/plan/next's lightweight preview — a title + date range only, no days/items. */
export interface NextPlanSummary {
	id: number;
	title: string;
	start_date: string;
	end_date: string;
}

export interface PlanItemInput {
	meal_type: MealType;
	food_id?: number;
	recipe_id?: number;
	quantity_grams?: number;
	servings?: number;
}

export interface PlanDayInput {
	day_offset: number;
	items: PlanItemInput[];
}

export interface PlanInput {
	title: string;
	start_date: string;
	end_date: string;
	days: PlanDayInput[];
}

export interface LogEntry {
	id: number;
	client_id: number;
	plan_item_id: number | null;
	food_id: number | null;
	recipe_id: number | null;
	quantity_grams: number | null;
	servings: number | null;
	log_date: string;
	status: 'eaten' | 'substituted' | 'skipped';
	source: 'manual' | 'ai_parsed';
	notes: string | null;
	/** Resolved food/recipe name, set by the practitioner-side /clients/{id}/logs endpoint only. */
	label?: string | null;
	created_at: string;
}

export interface LogEntryInput {
	plan_item_id?: number;
	food_id?: number;
	recipe_id?: number;
	quantity_grams?: number;
	servings?: number;
	log_date: string;
	status: 'eaten' | 'substituted' | 'skipped';
	notes?: string;
}

export interface Measurement {
	id: number;
	client_id: number;
	measured_at: string;
	weight_grams: number | null;
	metrics: Record< string, unknown >;
	notes: string | null;
	created_at: string;
}

export interface MeasurementInput {
	measured_at: string;
	weight_grams?: number;
	notes?: string;
}

/** A resolved food's per-100g nutrient profile — the shape FoodDataService::resolve() returns. */
export interface ResolvedFood {
	id: number;
	source: string;
	source_id: number;
	description: string;
	data_type: string;
	nutrients: Record<
		string,
		{ name: string; unit: string; amount_per_100g: number }
	>;
}

/** One row from GET /foods/search — the raw USDA search result shape. */
export interface FoodSearchResult {
	fdcId: number;
	description: string;
	dataType: string;
}

/** The shape GET /foods/search responds with — a "load more" batch, not a full page list. */
export interface FoodSearchResponse {
	items: FoodSearchResult[];
	has_more: boolean;
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
			/** This site's Settings → General → Date Format, a PHP date() format string (e.g. "F j, Y"). */
			dateFormat?: string;
			/** This site's Settings → General → Time Format, a PHP date() format string (e.g. "g:i a"). */
			timeFormat?: string;
			/** The site's name, shown in the email editor's preview header/footer. */
			siteName?: string;
			/** URL of the leaf mark used in the email header. */
			emailLogoUrl?: string;
		};
		nutrioClientPortal?: {
			restUrl?: string;
			restNonce?: string;
			mountId?: string;
			clientName?: string;
			dateFormat?: string;
			logoutUrl?: string;
		};
	}
}

export interface EmailTemplate {
	type: string;
	audience: 'practitioner' | 'client';
	subject: string;
	body: string;
	enabled: boolean;
	tags: Record< string, string >;
}

/** The From name/address shared by every Nutrio email. Empty = WordPress's default. */
export interface EmailSenderSettings {
	from_name: string;
	from_address: string;
	/** What WordPress sends from when these are empty — shown as placeholders. */
	defaults: { from_name: string; from_address: string };
}

export interface EmailDigestSettings {
	enabled: boolean;
	send_time: string;
}
