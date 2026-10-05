# Plan Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Plans screen — a list of meal plans plus a day-by-day builder (Breakfast/Lunch/Dinner/Snack meal slots, live per-day nutrient totals) that a practitioner can assign to a client, freezing its nutrient snapshot.

**Architecture:** The backend (migrations, `PlanRepository`, `PlanNutrientResolver`, `PlansController`'s CRUD/assign routes) already exists — this plan closes one real gap in it (the REST responses never return a plan's days/items) and builds the entire frontend on top: a `store/plans` Redux data module mirroring `store/recipes`, a `PlanLibrary` list screen, a two-tab `ItemSearch` component (recipes / USDA foods), the `PlanBuilder` screen itself (day tabs, meal sections, live nutrient panel, the unsaved-changes guard already built for Recipes/Clients), and an `AssignModal` that runs a client allergy check before calling the existing `/assign` endpoint.

**Tech Stack:** PHP 8.1 (WordPress, PSR-4, PHPUnit + Brain Monkey), TypeScript/React via `@wordpress/scripts`, `@wordpress/data` (thunks, not generators), CSS Modules.

**Spec:** `docs/superpowers/specs/2026-09-12-plan-builder-design.md`

## Global Constraints

- Nutrient amounts are always integers scaled ×1000 server-side (never floats) — the frontend divides by 1000 only for display, exactly as `src/utils/nutrients.ts` already does for Recipes.
- `@wordpress/data` store actions must be thunks, never generators (this WP version does not auto-dispatch a plain object yielded from a generator — a real bug hit earlier in this project).
- Every screen owns its own topbar (title + primary action, one row) — never add a competing title at the `App.tsx` level.
- A form component reused across different edit targets needs a `key` prop that changes with the target, or its `useState` lazy initializer goes stale (the exact bug fixed on `ClientForm`/`RecipeBuilder` earlier).
- Comments: short, single-purpose, human-readable — state the non-obvious "why," never restate what the code already says.
- No new automated frontend tests planned (per spec) — verify frontend work by hand in the browser, same as every other screen in this project. The one existing PHPUnit suite (`ControllerCapabilitiesTest`) must still pass after the backend change, since it directly asserts each controller's constructor dependency list.

---

## Task 1: Backend — return days/items in Plan responses, with resolved food/recipe labels

**Files:**
- Modify: `includes/RestApi/PlansController.php`
- Modify: `config/app.php`
- Modify: `tests/Unit/RestApi/ControllerCapabilitiesTest.php`

**Interfaces:**
- Consumes: `PlanRepository::days_for_plan(int $plan_id): array`, `PlanRepository::items_for_day(int $plan_day_id): array` (already exist, shapes described in `PlanRepository.php`'s own docblocks), `FoodCache::find(int $id): ?array` (returns `{id, source, source_id, description, data_type, nutrients}`), `RecipeRepository::find(int $id): ?array` (returns the raw recipe row, includes `name`), `RecipeNutrientResolver::calculate_per_serving_totals(int $recipe_id): ?array` (nutrient_id => int amount, ×1000-scaled).
- Produces: every `PlansController` response (`list_plans`, `create_plan`, `get_plan`, `update_plan`, `assign_plan`) now includes a `days` key: `array<{day_offset:int, items: array<PlanItemResponse>}>`, where each `PlanItemResponse` is the raw `plan_items` row plus `food_description: string|null`, `nutrients: object|null` (food items only), `recipe_name: string|null`, `recipe_nutrient_totals_per_serving: object|null` (recipe items only). This is the exact shape Task 4 (frontend types) is built against.

- [ ] **Step 1: Update `PlansController`'s constructor to take three more dependencies**

Open `includes/RestApi/PlansController.php`. Add the imports and extend the constructor:

```php
use MeroDiet\Nutrition\FoodCache;
use MeroDiet\Nutrition\PlanNutrientResolver;
use MeroDiet\Nutrition\RecipeNutrientResolver;
use MeroDiet\Repositories\ClientRepository;
use MeroDiet\Repositories\PlanRepository;
use MeroDiet\Repositories\RecipeRepository;
```

```php
	public function __construct(
		private readonly PlanRepository $plans,
		private readonly PlanNutrientResolver $resolver,
		private readonly ClientRepository $clients,
		private readonly FoodCache $food_cache,
		private readonly RecipeRepository $recipes,
		private readonly RecipeNutrientResolver $recipe_resolver
	) {}
```

- [ ] **Step 2: Rename `with_totals()` to `with_details()` and attach days/items**

Replace the existing private method:

```php
	private function with_totals( array $plan ): array {
		$plan['nutrient_totals'] = 'assigned' === $plan['status']
			? $plan['nutrient_snapshot']
			: $this->resolver->calculate_plan_totals( $plan['id'] );

		return $plan;
	}
```

with:

```php
	/**
	 * Attach nutrient totals and full day/item detail to a plan row.
	 * Totals are live for a draft, frozen for an assigned plan — see
	 * class docblock for why the source differs by status. Each item
	 * gets a resolved food_description or recipe_name attached so the
	 * frontend never has to look up a raw food_id/recipe_id itself.
	 *
	 * @param array<string, mixed> $plan Plan row.
	 *
	 * @return array<string, mixed>
	 */
	private function with_details( array $plan ): array {
		$plan['nutrient_totals'] = 'assigned' === $plan['status']
			? $plan['nutrient_snapshot']
			: $this->resolver->calculate_plan_totals( $plan['id'] );

		$plan['days'] = array_map(
			fn ( array $day ): array => array(
				'day_offset' => $day['day_offset'],
				'items'      => array_map( array( $this, 'with_item_details' ), $this->plans->items_for_day( $day['id'] ) ),
			),
			$this->plans->days_for_plan( $plan['id'] )
		);

		return $plan;
	}

	/**
	 * Attach a resolved label (and its source nutrients, for the
	 * frontend's live per-day estimate) to one plan item.
	 *
	 * @param array<string, mixed> $item Raw plan_items row.
	 *
	 * @return array<string, mixed>
	 */
	private function with_item_details( array $item ): array {
		if ( null !== $item['food_id'] ) {
			$food                     = $this->food_cache->find( $item['food_id'] );
			$item['food_description'] = $food['description'] ?? null;
			$item['nutrients']        = $food['nutrients'] ?? array();
			$item['recipe_name']      = null;
			$item['recipe_nutrient_totals_per_serving'] = null;

			return $item;
		}

		$recipe                      = $this->recipes->find( (int) $item['recipe_id'] );
		$item['recipe_name']        = $recipe['name'] ?? null;
		$item['recipe_nutrient_totals_per_serving'] = null === $item['recipe_id']
			? null
			: $this->recipe_resolver->calculate_per_serving_totals( (int) $item['recipe_id'] );
		$item['food_description']   = null;
		$item['nutrients']          = null;

		return $item;
	}
```

- [ ] **Step 3: Update the 4 call sites from `with_totals` to `with_details`**

In the same file, `list_plans`, `create_plan`, `get_plan`, `update_plan`, and `assign_plan` each call `$this->with_totals(...)` — replace every occurrence with `$this->with_details(...)`. (Five call sites total: one `array_map` in `list_plans`, four direct calls.)

- [ ] **Step 4: Register the new dependencies in the DI container**

In `config/app.php`, find the `PlansController::class` entry (currently 3 dependencies) and add the 3 new ones, in the same order as the constructor:

```php
			\MeroDiet\RestApi\PlansController::class   => array(
				\MeroDiet\Repositories\PlanRepository::class,
				\MeroDiet\Nutrition\PlanNutrientResolver::class,
				\MeroDiet\Repositories\ClientRepository::class,
				\MeroDiet\Nutrition\FoodCache::class,
				\MeroDiet\Repositories\RecipeRepository::class,
				\MeroDiet\Nutrition\RecipeNutrientResolver::class,
			),
```

- [ ] **Step 5: Update the existing capability test's mocked dependency list**

In `tests/Unit/RestApi/ControllerCapabilitiesTest.php`, find this line inside `controller_provider()`:

```php
			'PlansController'    => array( PlansController::class, array( PlanRepository::class, PlanNutrientResolver::class, ClientRepository::class ), 'manage_merodiet_plans' ),
```

Replace it with:

```php
			'PlansController'    => array( PlansController::class, array( PlanRepository::class, PlanNutrientResolver::class, ClientRepository::class, FoodCache::class, RecipeRepository::class, RecipeNutrientResolver::class ), 'manage_merodiet_plans' ),
```

`FoodCache`, `RecipeRepository`, and `RecipeNutrientResolver` are already imported at the top of this file (used by `RecipesController`'s row) — no new `use` statements needed.

- [ ] **Step 6: Run the existing PHPUnit suite**

Run: `composer test -- --filter ControllerCapabilitiesTest`
Expected: PASS (this test now builds `PlansController` with 6 mocked dependencies instead of 3 and asserts every route still requires `manage_merodiet_plans`).

Run: `composer test`
Expected: full suite PASS — nothing else references `PlansController`'s constructor shape or `with_totals`.

- [ ] **Step 7: Verify the PHP syntax and commit**

Run: `php -l includes/RestApi/PlansController.php`
Expected: `No syntax errors detected`

```bash
git add includes/RestApi/PlansController.php config/app.php tests/Unit/RestApi/ControllerCapabilitiesTest.php
git commit -m "fix: plan responses now include days/items with resolved food/recipe labels"
```

---

## Task 2: Frontend types for plans

**Files:**
- Modify: `src/types.ts`

**Interfaces:**
- Produces: `PlanItem`, `PlanDay`, `Plan`, `PlanItemInput`, `PlanDayInput`, `PlanInput` — every later frontend task imports these from `../../types` (or `../types` depending on file depth), exactly as `RecipeItem`/`Recipe`/`RecipeInput` are imported today.

- [ ] **Step 1: Add the types**

Append to `src/types.ts` (after the existing `Recipe`/`RecipeInput` block, before `ResolvedFood`):

```ts
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface PlanItem {
	id: number;
	meal_type: MealType;
	food_id: number | null;
	recipe_id: number | null;
	quantity_grams: number | null;
	servings: number | null;
	food_description: string | null;
	nutrients: Record< string, { name: string; unit: string; amount_per_100g: number } > | null;
	recipe_name: string | null;
	recipe_nutrient_totals_per_serving: NutrientTotals | null;
}

export interface PlanDay {
	day_offset: number;
	items: PlanItem[];
}

export interface Plan {
	id: number;
	practitioner_user_id: number;
	client_id: number | null;
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
```

- [ ] **Step 2: Type-check**

Run: `npm run check-types`
Expected: no errors (these are additive-only interfaces, nothing yet imports them).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add Plan-related frontend types"
```

---

## Task 3: `store/plans` data module

**Files:**
- Create: `src/store/plans/reducer.ts`
- Create: `src/store/plans/actions.ts`
- Create: `src/store/plans/selectors.ts`
- Create: `src/store/plans/resolvers.ts`
- Create: `src/store/plans/index.ts`
- Modify: `src/admin/index.tsx`

**Interfaces:**
- Consumes: `Plan`, `PlanInput` from `../../types` (Task 2).
- Produces: `STORE_NAME = 'merodiet/plans'`; actions `receivePlans(plans: Plan[])`, `receivePlan(plan: Plan)`, `removePlan(id: number)`; thunks `getPlans()`, `getPlan(id: number)`, `createPlan(data: PlanInput): Promise<Plan>`, `updatePlan(id: number, data: Partial<PlanInput>): Promise<Plan>`, `deletePlan(id: number): Promise<void>`, `assignPlan(id: number, clientId: number): Promise<Plan>`; selectors `getPlans(state): Plan[]`, `getPlan(state, id): Plan | null`. This is the exact interface Task 6 (`PlanLibrary`), Task 7 (`PlanBuilder`), Task 8 (`AssignModal`), and Task 9 (`PlanScreen`) are built against.

- [ ] **Step 1: Write the reducer**

`src/store/plans/reducer.ts`:

```ts
import type { Plan } from '../../types';

interface State {
	byId: Record< number, Plan >;
	allIds: number[];
}

const DEFAULT_STATE: State = {
	byId: {},
	allIds: [],
};

type Action =
	| { type: 'RECEIVE_PLANS'; plans: Plan[] }
	| { type: 'RECEIVE_PLAN'; plan: Plan }
	| { type: 'REMOVE_PLAN'; id: number };

export default function reducer( state: State = DEFAULT_STATE, action: Action ): State {
	switch ( action.type ) {
		case 'RECEIVE_PLANS': {
			const byId = { ...state.byId };
			const allIds = [ ...state.allIds ];

			for ( const plan of action.plans ) {
				if ( ! byId[ plan.id ] ) {
					allIds.push( plan.id );
				}
				byId[ plan.id ] = plan;
			}

			return { byId, allIds };
		}

		case 'RECEIVE_PLAN': {
			const exists = Boolean( state.byId[ action.plan.id ] );

			return {
				byId: { ...state.byId, [ action.plan.id ]: action.plan },
				allIds: exists ? state.allIds : [ ...state.allIds, action.plan.id ],
			};
		}

		case 'REMOVE_PLAN': {
			const byId = { ...state.byId };
			delete byId[ action.id ];

			return {
				byId,
				allIds: state.allIds.filter( ( id ) => id !== action.id ),
			};
		}

		default:
			return state;
	}
}
```

- [ ] **Step 2: Write the actions (thunks)**

`src/store/plans/actions.ts`:

```ts
import apiFetch from '@wordpress/api-fetch';
import type { Plan, PlanInput } from '../../types';

export function receivePlans( plans: Plan[] ) {
	return { type: 'RECEIVE_PLANS' as const, plans };
}

export function receivePlan( plan: Plan ) {
	return { type: 'RECEIVE_PLAN' as const, plan };
}

export function removePlan( id: number ) {
	return { type: 'REMOVE_PLAN' as const, id };
}

interface ThunkArgs {
	dispatch: {
		receivePlan: ( plan: Plan ) => void;
		removePlan: ( id: number ) => void;
	};
}

// Thunks (not generators) — see src/store/clients/actions.ts for why.
export function createPlan( data: PlanInput ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const plan: Plan = await apiFetch( {
			path: '/merodiet/v1/plans',
			method: 'POST',
			data,
		} );

		dispatch.receivePlan( plan );

		return plan;
	};
}

export function updatePlan( id: number, data: Partial< PlanInput > ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const plan: Plan = await apiFetch( {
			path: `/merodiet/v1/plans/${ id }`,
			method: 'PATCH',
			data,
		} );

		dispatch.receivePlan( plan );

		return plan;
	};
}

export function deletePlan( id: number ) {
	return async ( { dispatch }: ThunkArgs ) => {
		await apiFetch( {
			path: `/merodiet/v1/plans/${ id }`,
			method: 'DELETE',
		} );

		dispatch.removePlan( id );
	};
}

export function assignPlan( id: number, clientId: number ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const plan: Plan = await apiFetch( {
			path: `/merodiet/v1/plans/${ id }/assign`,
			method: 'POST',
			data: { client_id: clientId },
		} );

		dispatch.receivePlan( plan );

		return plan;
	};
}
```

- [ ] **Step 3: Write the resolvers**

`src/store/plans/resolvers.ts`:

```ts
import apiFetch from '@wordpress/api-fetch';
import type { Plan } from '../../types';

interface ThunkArgs {
	dispatch: {
		receivePlans: ( plans: Plan[] ) => void;
		receivePlan: ( plan: Plan ) => void;
	};
}

export function getPlans() {
	return async ( { dispatch }: ThunkArgs ) => {
		const plans: Plan[] = await apiFetch( { path: '/merodiet/v1/plans' } );

		dispatch.receivePlans( plans );
	};
}

export function getPlan( id: number ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const plan: Plan = await apiFetch( { path: `/merodiet/v1/plans/${ id }` } );

		dispatch.receivePlan( plan );
	};
}
```

- [ ] **Step 4: Write the selectors**

`src/store/plans/selectors.ts`:

```ts
import type { Plan } from '../../types';

interface State {
	byId: Record< number, Plan >;
	allIds: number[];
}

export function getPlans( state: State ): Plan[] {
	return state.allIds.map( ( id ) => state.byId[ id ] );
}

export function getPlan( state: State, id: number ): Plan | null {
	return state.byId[ id ] ?? null;
}
```

- [ ] **Step 5: Wire up the store**

`src/store/plans/index.ts`:

```ts
import { createReduxStore, register } from '@wordpress/data';
import reducer from './reducer';
import * as actions from './actions';
import * as selectors from './selectors';
import * as resolvers from './resolvers';

export const STORE_NAME = 'merodiet/plans';

export const store = createReduxStore( STORE_NAME, {
	reducer,
	actions,
	selectors,
	resolvers,
} );

register( store );
```

- [ ] **Step 6: Register the store on app boot**

In `src/admin/index.tsx`, add the import alongside the existing store imports:

```ts
import '../store/clients';
import '../store/recipes';
import '../store/plans';
```

- [ ] **Step 7: Type-check and lint**

Run: `npm run check-types`
Expected: no errors.

Run: `npx wp-scripts lint-js src/store/plans/reducer.ts src/store/plans/actions.ts src/store/plans/selectors.ts src/store/plans/resolvers.ts src/store/plans/index.ts src/admin/index.tsx --fix`
Expected: no remaining errors (pre-existing unrelated lint debt elsewhere in the project is out of scope — don't fix files this task didn't touch).

- [ ] **Step 8: Commit**

```bash
git add src/store/plans src/admin/index.tsx
git commit -m "feat: add store/plans data module"
```

---

## Task 4: Live per-day nutrient estimate math

**Files:**
- Modify: `src/utils/nutrients.ts`

**Interfaces:**
- Consumes: `PlanItem`'s shape (a food item carries `quantity_grams` + `nutrients`; a recipe item carries `servings` + `recipe_nutrient_totals_per_serving`) — but this function must not import `PlanItem` itself (it's used from a draft-item shape in `PlanBuilder`, not directly from the API type), so it takes a narrower inline type, mirroring how `estimateNutrientsPerServing` already takes `Pick<RecipeItem, 'quantity_grams' | 'nutrients'>[]`.
- Produces: `estimateDayNutrients(items): NutrientSummary` — used by Task 7 (`PlanBuilder`)'s per-day nutrient panel.

- [ ] **Step 1: Add the function**

In `src/utils/nutrients.ts`, add after `estimateNutrientsPerServing`:

```ts
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

/**
 * Live estimate for one plan day, mixing direct-food items (scaled by
 * grams, like a recipe's own ingredients) and recipe items (scaled by
 * number of servings, using that recipe's own already-computed
 * per-serving totals rather than re-deriving them from its ingredients).
 */
export function estimateDayNutrients( items: ( DayFoodItem | DayRecipeItem )[] ): NutrientSummary {
	const totals: Record< string, number > = {};

	const add = ( nutrientId: string, amount: number ) => {
		totals[ nutrientId ] = ( totals[ nutrientId ] ?? 0 ) + amount;
	};

	for ( const item of items ) {
		if ( item.kind === 'food' ) {
			for ( const [ nutrientId, nutrient ] of Object.entries( item.nutrients ) ) {
				add( nutrientId, ( nutrient.amount_per_100g * item.quantity_grams ) / 100 );
			}
		} else {
			for ( const [ nutrientId, amount ] of Object.entries( item.nutrient_totals_per_serving ) ) {
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
```

- [ ] **Step 2: Type-check and lint**

Run: `npm run check-types`
Expected: no errors.

Run: `npx wp-scripts lint-js src/utils/nutrients.ts --fix`
Expected: no remaining errors.

- [ ] **Step 3: Commit**

```bash
git add src/utils/nutrients.ts
git commit -m "feat: add live per-day nutrient estimate for plans"
```

---

## Task 5: `ItemSearch` — two-tab food/recipe picker

**Files:**
- Create: `src/screens/plans/ItemSearch.tsx`
- Create: `src/screens/plans/ItemSearch.module.css`

**Interfaces:**
- Consumes: existing `FoodSearch` component (`src/screens/recipes/FoodSearch.tsx`, prop `onResolve: (food: ResolvedFood) => void`), `store/recipes`'s `getRecipes` selector (already-fetched recipe list, filtered client-side — no new endpoint), `Recipe` type.
- Produces: `<ItemSearch onSelectFood={(food: ResolvedFood) => void} onSelectRecipe={(recipe: Recipe) => void} />` — consumed by Task 7 (`PlanBuilder`).

- [ ] **Step 1: Write the component**

`src/screens/plans/ItemSearch.tsx`:

```tsx
import { useState } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
import { __ } from '@wordpress/i18n';
import { STORE_NAME as RECIPES_STORE } from '../../store/recipes';
import FoodSearch from '../recipes/FoodSearch';
import styles from './ItemSearch.module.css';
import type { Recipe, ResolvedFood } from '../../types';

interface RecipesStoreSelectors {
	getRecipes: () => Recipe[];
}

interface ItemSearchProps {
	onSelectFood: ( food: ResolvedFood ) => void;
	onSelectRecipe: ( recipe: Recipe ) => void;
}

export default function ItemSearch( { onSelectFood, onSelectRecipe }: ItemSearchProps ) {
	const [ tab, setTab ] = useState< 'recipes' | 'foods' >( 'recipes' );
	const [ query, setQuery ] = useState( '' );

	const recipes = useSelect( ( select ) => {
		const store = select( RECIPES_STORE ) as unknown as RecipesStoreSelectors;
		return store.getRecipes();
	}, [] );

	const filteredRecipes = recipes.filter( ( recipe ) => recipe.name.toLowerCase().includes( query.toLowerCase() ) );

	return (
		<div>
			<div className={ styles.tabs }>
				<button
					className={ `${ styles.tab } ${ tab === 'recipes' ? styles.isActive : '' }`.trim() }
					onClick={ () => setTab( 'recipes' ) }
				>
					{ __( 'My Recipes', 'merodiet' ) }
				</button>
				<button
					className={ `${ styles.tab } ${ tab === 'foods' ? styles.isActive : '' }`.trim() }
					onClick={ () => setTab( 'foods' ) }
				>
					{ __( 'USDA Foods', 'merodiet' ) }
				</button>
			</div>

			{ tab === 'recipes' && (
				<>
					<div className="merodiet-field" style={ { marginBottom: '12px' } }>
						<input
							type="text"
							value={ query }
							onChange={ ( e ) => setQuery( e.target.value ) }
							placeholder={ __( 'Search your recipes…', 'merodiet' ) }
						/>
					</div>

					{ filteredRecipes.length === 0 && (
						<p style={ { fontSize: '12.5px', color: 'var(--ink-muted)' } }>
							{ recipes.length === 0
								? __( 'No recipes in your library yet.', 'merodiet' )
								: __( 'No matches.', 'merodiet' ) }
						</p>
					) }

					{ filteredRecipes.map( ( recipe ) => (
						<button key={ recipe.id } className={ styles.result } onClick={ () => onSelectRecipe( recipe ) }>
							<div className={ styles.name }>{ recipe.name }</div>
							<div className={ styles.meta }>
								{ __( 'Servings:', 'merodiet' ) } { recipe.servings }
							</div>
						</button>
					) ) }
				</>
			) }

			{ tab === 'foods' && <FoodSearch onResolve={ onSelectFood } /> }
		</div>
	);
}
```

- [ ] **Step 2: Write the CSS**

`src/screens/plans/ItemSearch.module.css`:

```css
.tabs {
	display: flex;
	gap: 6px;
	margin-bottom: 12px;
	border-bottom: 1px solid var(--line);
}
.tab {
	font-family: inherit;
	font-size: 13px;
	font-weight: 600;
	padding: 8px 4px;
	background: none;
	border: none;
	border-bottom: 2px solid transparent;
	color: var(--ink-muted);
	cursor: pointer;
}
.tab.isActive {
	color: var(--ink);
	border-bottom-color: var(--sage-deep);
}

.result {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 2px;
	width: 100%;
	text-align: left;
	padding: 10px 8px;
	background: none;
	border: none;
	border-bottom: 1px solid var(--line);
	cursor: pointer;
	font-family: inherit;
}
.result:last-child {
	border-bottom: none;
}
.result:hover {
	background: var(--paper-dim);
}
.name {
	font-size: 13.5px;
	font-weight: 600;
}
.meta {
	font-size: 12px;
	color: var(--ink-faint);
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npm run check-types`
Expected: no errors.

Run: `npx wp-scripts lint-js src/screens/plans/ItemSearch.tsx --fix`
Expected: no remaining errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens/plans/ItemSearch.tsx src/screens/plans/ItemSearch.module.css
git commit -m "feat: add ItemSearch (recipes/USDA foods picker) for plans"
```

---

## Task 6: `PlanLibrary` — the list screen

**Files:**
- Create: `src/screens/plans/PlanLibrary.tsx`

**Interfaces:**
- Consumes: `Plan`, `Client` types; `formatAmount`, `summarizeNutrients` from `../../utils/nutrients` (existing); `Panel`/`PanelBody`, `Button`, `IconButton`, `Chip` (existing, `src/components/ui/*`).
- Produces: `<PlanLibrary plans={Plan[]} clients={Client[]} isLoading={boolean} onAdd={() => void} onEdit={(id: number) => void} onDelete={(plan: Plan) => void} />` — consumed by Task 9 (`PlanScreen`).

- [ ] **Step 1: Write the component**

`src/screens/plans/PlanLibrary.tsx`:

```tsx
import { __ } from '@wordpress/i18n';
import Panel, { PanelBody } from '../../components/ui/Panel';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import Chip from '../../components/ui/Chip';
import { formatAmount, summarizeNutrients } from '../../utils/nutrients';
import type { Client, Plan } from '../../types';

interface PlanLibraryProps {
	plans: Plan[];
	clients: Client[];
	isLoading: boolean;
	onAdd: () => void;
	onEdit: ( id: number ) => void;
	onDelete: ( plan: Plan ) => void;
}

export default function PlanLibrary( { plans, clients, isLoading, onAdd, onEdit, onDelete }: PlanLibraryProps ) {
	const clientName = ( clientId: number | null ): string => {
		const client = clients.find( ( c ) => c.id === clientId );
		return client ? `${ client.first_name } ${ client.last_name }` : __( 'Unassigned', 'merodiet' );
	};

	const avgDailyKcal = ( plan: Plan ): number | null => {
		const perDay = Object.values( plan.nutrient_totals ).map( ( totals ) => summarizeNutrients( totals ).kcal ?? 0 );
		return perDay.length === 0 ? null : perDay.reduce( ( a, b ) => a + b, 0 ) / perDay.length;
	};

	return (
		<>
			<div className="merodiet-topbar">
				<h1>{ __( 'Meal plans', 'merodiet' ) }</h1>
				<Button variant="primary" onClick={ onAdd }>
					<PlusIcon />
					{ __( 'New plan', 'merodiet' ) }
				</Button>
			</div>

			<Panel>
				<PanelBody className="merodiet-table-wrap">
					{ isLoading && <p>{ __( 'Loading…', 'merodiet' ) }</p> }

					{ ! isLoading && plans.length === 0 && (
						<p>{ __( 'No plans yet. Build your first plan to start assigning nutrition to clients.', 'merodiet' ) }</p>
					) }

					{ ! isLoading && plans.length > 0 && (
						<table className="merodiet-table">
							<thead>
								<tr>
									<th>{ __( 'Title', 'merodiet' ) }</th>
									<th>{ __( 'Client', 'merodiet' ) }</th>
									<th>{ __( 'Dates', 'merodiet' ) }</th>
									<th>{ __( 'Avg. kcal/day', 'merodiet' ) }</th>
									<th>{ __( 'Status', 'merodiet' ) }</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{ plans.map( ( plan ) => (
									<tr key={ plan.id }>
										<td style={ { fontWeight: 600 } }>{ plan.title }</td>
										<td>{ clientName( plan.client_id ) }</td>
										<td className="merodiet-mono">
											{ plan.start_date } – { plan.end_date }
										</td>
										<td className="merodiet-mono">{ formatAmount( avgDailyKcal( plan ), '' ) }</td>
										<td>
											<Chip tone={ plan.status === 'assigned' ? 'success' : 'clay' }>{ plan.status }</Chip>
										</td>
										<td>
											<div className="merodiet-row-actions">
												<IconButton label={ __( 'Open plan', 'merodiet' ) } onClick={ () => onEdit( plan.id ) }>
													<EditIcon />
												</IconButton>
												<IconButton label={ __( 'Remove plan', 'merodiet' ) } onClick={ () => onDelete( plan ) }>
													<TrashIcon />
												</IconButton>
											</div>
										</td>
									</tr>
								) ) }
							</tbody>
						</table>
					) }
				</PanelBody>
			</Panel>
		</>
	);
}

function PlusIcon() {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<path d="M12 5v14M5 12h14" />
		</svg>
	);
}

function EditIcon() {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<path d="M12 20h9" />
			<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
		</svg>
	);
}

function TrashIcon() {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" />
		</svg>
	);
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npm run check-types`
Expected: no errors.

Run: `npx wp-scripts lint-js src/screens/plans/PlanLibrary.tsx --fix`
Expected: no remaining errors.

- [ ] **Step 3: Commit**

```bash
git add src/screens/plans/PlanLibrary.tsx
git commit -m "feat: add PlanLibrary list screen"
```

---

## Task 7: `PlanBuilder` — day tabs, meal sections, live nutrient panel

**Files:**
- Create: `src/screens/plans/PlanBuilder.tsx`
- Create: `src/screens/plans/PlanBuilder.module.css`

**Interfaces:**
- Consumes: `ItemSearch` (Task 5), `estimateDayNutrients` (Task 4), `useGlobalDirtyState`/`UnsavedBadge` (existing, built for Recipes/Clients), `Plan`/`PlanInput`/`PlanDayInput`/`PlanItemInput`/`MealType` (Task 2).
- Produces: `<PlanBuilder plan={Plan | null} onSave={(data: PlanInput) => Promise<void>} onCancel={() => void} onAssignClick={() => void} />` — consumed by Task 9 (`PlanScreen`). `onAssignClick` is only ever called when `plan` is a saved draft (button is hidden otherwise); `PlanScreen` opens `AssignModal` in response.

- [ ] **Step 1: Write the component**

`src/screens/plans/PlanBuilder.tsx`:

```tsx
import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import Button from '../../components/ui/Button';
import Panel, { PanelBody, PanelHead } from '../../components/ui/Panel';
import UnsavedBadge from '../../components/ui/UnsavedBadge';
import { useGlobalDirtyState } from '../../hooks/useGlobalDirtyState';
import ItemSearch from './ItemSearch';
import styles from './PlanBuilder.module.css';
import { estimateDayNutrients, formatAmount } from '../../utils/nutrients';
import type { MealType, Plan, PlanDayInput, PlanInput, PlanItem, PlanItemInput, Recipe, ResolvedFood } from '../../types';

const MEAL_TYPES: { id: MealType; label: string }[] = [
	{ id: 'breakfast', label: __( 'Breakfast', 'merodiet' ) },
	{ id: 'lunch', label: __( 'Lunch', 'merodiet' ) },
	{ id: 'dinner', label: __( 'Dinner', 'merodiet' ) },
	{ id: 'snack', label: __( 'Snack', 'merodiet' ) },
];

interface DraftItem extends PlanItemInput {
	label: string;
	nutrients: Record< string, { amount_per_100g: number } > | null;
	recipe_nutrient_totals_per_serving: Record< string, number > | null;
}

interface DraftDay {
	day_offset: number;
	items: DraftItem[];
}

interface PlanBuilderProps {
	plan: Plan | null;
	onSave: ( data: PlanInput ) => Promise< void >;
	onCancel: () => void;
	onAssignClick: () => void;
}

/** One draft day per date between start/end (inclusive) — see spec's "auto-generate from dates" decision. */
function daysBetween( startDate: string, endDate: string ): number {
	const start = new Date( startDate );
	const end = new Date( endDate );
	const diffDays = Math.round( ( end.getTime() - start.getTime() ) / ( 1000 * 60 * 60 * 24 ) );
	return Math.max( 1, diffDays + 1 );
}

function addDays( dateStr: string, days: number ): string {
	const date = new Date( dateStr );
	date.setDate( date.getDate() + days );
	return date.toISOString().slice( 0, 10 );
}

function draftItemFromApiItem( item: PlanItem ): DraftItem {
	return {
		meal_type: item.meal_type,
		food_id: item.food_id ?? undefined,
		recipe_id: item.recipe_id ?? undefined,
		quantity_grams: item.quantity_grams ?? undefined,
		servings: item.servings ?? undefined,
		label: item.food_description ?? item.recipe_name ?? __( '(unknown item)', 'merodiet' ),
		nutrients: item.nutrients,
		recipe_nutrient_totals_per_serving: item.recipe_nutrient_totals_per_serving,
	};
}

export default function PlanBuilder( { plan, onSave, onCancel, onAssignClick }: PlanBuilderProps ) {
	const isReadOnly = plan?.status === 'assigned';

	const [ title, setTitle ] = useState( plan?.title ?? '' );
	const [ startDate, setStartDate ] = useState( plan?.start_date ?? new Date().toISOString().slice( 0, 10 ) );
	const [ endDate, setEndDate ] = useState( plan?.end_date ?? new Date().toISOString().slice( 0, 10 ) );
	const [ days, setDays ] = useState< DraftDay[] >( () => {
		if ( plan ) {
			return plan.days.map( ( day ) => ( { day_offset: day.day_offset, items: day.items.map( draftItemFromApiItem ) } ) );
		}
		return [ { day_offset: 0, items: [] } ];
	} );
	const [ activeDayOffset, setActiveDayOffset ] = useState( 0 );
	const [ addingTo, setAddingTo ] = useState< MealType | null >( null );
	const [ isSaving, setIsSaving ] = useState( false );

	const { isDirty, markClean } = useGlobalDirtyState( { title, startDate, endDate, days } );

	/** Regenerate day tabs from the date range, keeping items on days that still exist. */
	const applyDateRange = ( newStart: string, newEnd: string ) => {
		const count = daysBetween( newStart, newEnd );
		const droppedItems = days.filter( ( d ) => d.day_offset >= count && d.items.length > 0 );

		if (
			droppedItems.length > 0 &&
			// eslint-disable-next-line no-alert
			! window.confirm( __( 'Shortening the date range will remove items already added on the dropped days. Continue?', 'merodiet' ) )
		) {
			return;
		}

		setDays( ( prev ) => {
			const next: DraftDay[] = [];
			for ( let offset = 0; offset < count; offset++ ) {
				next.push( prev.find( ( d ) => d.day_offset === offset ) ?? { day_offset: offset, items: [] } );
			}
			return next;
		} );

		setStartDate( newStart );
		setEndDate( newEnd );

		if ( activeDayOffset >= count ) {
			setActiveDayOffset( 0 );
		}
	};

	const activeDay = days.find( ( d ) => d.day_offset === activeDayOffset ) ?? days[ 0 ];

	const addFoodItem = ( food: ResolvedFood ) => {
		if ( ! addingTo ) {
			return;
		}
		setDays( ( prev ) =>
			prev.map( ( day ) =>
				day.day_offset === activeDayOffset
					? {
							...day,
							items: [
								...day.items,
								{
									meal_type: addingTo,
									food_id: food.id,
									quantity_grams: 100,
									label: food.description,
									nutrients: food.nutrients,
									recipe_nutrient_totals_per_serving: null,
								},
							],
					  }
					: day
			)
		);
		setAddingTo( null );
	};

	const addRecipeItem = ( recipe: Recipe ) => {
		if ( ! addingTo ) {
			return;
		}
		setDays( ( prev ) =>
			prev.map( ( day ) =>
				day.day_offset === activeDayOffset
					? {
							...day,
							items: [
								...day.items,
								{
									meal_type: addingTo,
									recipe_id: recipe.id,
									servings: 1,
									label: recipe.name,
									nutrients: null,
									recipe_nutrient_totals_per_serving: recipe.nutrient_totals_per_serving,
								},
							],
					  }
					: day
			)
		);
		setAddingTo( null );
	};

	const removeItem = ( mealType: MealType, index: number ) => {
		setDays( ( prev ) =>
			prev.map( ( day ) =>
				day.day_offset === activeDayOffset
					? { ...day, items: day.items.filter( ( item, i ) => ! ( item.meal_type === mealType && itemIndexWithinMeal( day.items, mealType, i ) === index ) ) }
					: day
			)
		);
	};

	// Items are stored in one flat array per day (matches the backend's
	// flat plan_items-per-plan_day shape) but rendered grouped by meal
	// type — this maps a row's position within its own meal-type group
	// back to its position in the flat array.
	function itemIndexWithinMeal( items: DraftItem[], mealType: MealType, flatIndex: number ): number {
		let count = -1;
		for ( let i = 0; i <= flatIndex; i++ ) {
			if ( items[ i ].meal_type === mealType ) {
				count++;
			}
		}
		return count;
	}

	const setItemQuantity = ( mealType: MealType, mealIndex: number, quantity_grams: number ) => {
		setDays( ( prev ) =>
			prev.map( ( day ) => {
				if ( day.day_offset !== activeDayOffset ) {
					return day;
				}
				let seen = -1;
				return {
					...day,
					items: day.items.map( ( item ) => {
						if ( item.meal_type !== mealType ) {
							return item;
						}
						seen++;
						return seen === mealIndex ? { ...item, quantity_grams } : item;
					} ),
				};
			} )
		);
	};

	const setItemServings = ( mealType: MealType, mealIndex: number, servings: number ) => {
		setDays( ( prev ) =>
			prev.map( ( day ) => {
				if ( day.day_offset !== activeDayOffset ) {
					return day;
				}
				let seen = -1;
				return {
					...day,
					items: day.items.map( ( item ) => {
						if ( item.meal_type !== mealType ) {
							return item;
						}
						seen++;
						return seen === mealIndex ? { ...item, servings } : item;
					} ),
				};
			} )
		);
	};

	const handleSave = async () => {
		setIsSaving( true );
		try {
			const data: PlanInput = {
				title,
				start_date: startDate,
				end_date: endDate,
				days: days.map(
					( day ): PlanDayInput => ( {
						day_offset: day.day_offset,
						items: day.items.map( ( item ) => ( {
							meal_type: item.meal_type,
							food_id: item.food_id,
							recipe_id: item.recipe_id,
							quantity_grams: item.quantity_grams,
							servings: item.servings,
						} ) ),
					} )
				),
			};
			await onSave( data );
			markClean();
		} finally {
			setIsSaving( false );
		}
	};

	const handleCancel = () => {
		// eslint-disable-next-line no-alert
		if ( ! isDirty || window.confirm( __( 'Discard unsaved changes?', 'merodiet' ) ) ) {
			onCancel();
		}
	};

	const summary = activeDay
		? estimateDayNutrients(
				activeDay.items.map( ( item ) =>
					item.food_id
						? { kind: 'food' as const, quantity_grams: item.quantity_grams ?? 0, nutrients: item.nutrients ?? {} }
						: { kind: 'recipe' as const, servings: item.servings ?? 0, nutrient_totals_per_serving: item.recipe_nutrient_totals_per_serving ?? {} }
				)
		  )
		: { kcal: null, protein: null, carbs: null, fat: null };

	return (
		<>
			<div className="merodiet-topbar">
				<div style={ { display: 'flex', alignItems: 'center', gap: '12px' } }>
					<h1>{ plan ? plan.title : __( 'New plan', 'merodiet' ) }</h1>
					{ isDirty && <UnsavedBadge /> }
					{ isReadOnly && <span style={ { fontSize: '12px', color: 'var(--ink-muted)' } }>{ __( 'Assigned — read only', 'merodiet' ) }</span> }
				</div>
				<div style={ { display: 'flex', gap: '10px' } }>
					<Button variant="ghost" onClick={ handleCancel } disabled={ isSaving }>
						{ isReadOnly ? __( 'Back', 'merodiet' ) : __( 'Cancel', 'merodiet' ) }
					</Button>
					{ ! isReadOnly && (
						<Button variant="primary" onClick={ handleSave } disabled={ isSaving || ! title }>
							{ plan ? __( 'Save changes', 'merodiet' ) : __( 'Create plan', 'merodiet' ) }
						</Button>
					) }
					{ ! isReadOnly && plan && (
						<Button variant="ghost" onClick={ onAssignClick } disabled={ isSaving || isDirty }>
							{ __( 'Assign to client', 'merodiet' ) }
						</Button>
					) }
				</div>
			</div>

			<div className={ styles.grid }>
				<Panel>
					<PanelBody>
						<div className={ styles.nameRow } style={ { marginBottom: '16px' } }>
							<div className="merodiet-field">
								<label htmlFor="merodiet-plan-title">{ __( 'Plan title', 'merodiet' ) }</label>
								<input
									id="merodiet-plan-title"
									type="text"
									value={ title }
									onChange={ ( e ) => setTitle( e.target.value ) }
									disabled={ isReadOnly }
								/>
							</div>
							<div className="merodiet-field">
								<label htmlFor="merodiet-plan-start">{ __( 'Start date', 'merodiet' ) }</label>
								<input
									id="merodiet-plan-start"
									type="date"
									value={ startDate }
									onChange={ ( e ) => applyDateRange( e.target.value, endDate ) }
									disabled={ isReadOnly }
								/>
							</div>
							<div className="merodiet-field">
								<label htmlFor="merodiet-plan-end">{ __( 'End date', 'merodiet' ) }</label>
								<input
									id="merodiet-plan-end"
									type="date"
									value={ endDate }
									onChange={ ( e ) => applyDateRange( startDate, e.target.value ) }
									disabled={ isReadOnly }
								/>
							</div>
						</div>

						<div className={ styles.dayTabs }>
							{ days.map( ( day ) => (
								<button
									key={ day.day_offset }
									className={ `${ styles.dayTab } ${ day.day_offset === activeDayOffset ? styles.isActive : '' }`.trim() }
									onClick={ () => setActiveDayOffset( day.day_offset ) }
								>
									{ __( 'Day', 'merodiet' ) } { day.day_offset + 1 }
									<span className={ styles.dayTabDate }>{ addDays( startDate, day.day_offset ) }</span>
								</button>
							) ) }
						</div>

						{ MEAL_TYPES.map( ( meal ) => {
							const mealItems = ( activeDay?.items ?? [] ).filter( ( item ) => item.meal_type === meal.id );

							return (
								<div key={ meal.id } className={ styles.mealSection }>
									<div className={ styles.mealHeader }>
										<h3>{ meal.label }</h3>
										{ ! isReadOnly && (
											<button className={ styles.addBtn } onClick={ () => setAddingTo( meal.id ) }>
												+ { __( 'Add', 'merodiet' ) }
											</button>
										) }
									</div>

									{ mealItems.length === 0 && (
										<p style={ { fontSize: '12px', color: 'var(--ink-faint)', padding: '6px 0' } }>
											{ __( 'Nothing added yet.', 'merodiet' ) }
										</p>
									) }

									{ mealItems.map( ( item, index ) => (
										<div className={ styles.itemRow } key={ index }>
											<div>{ item.label }</div>
											{ item.food_id ? (
												<input
													className={ styles.qtyInput }
													type="number"
													min={ 0 }
													value={ item.quantity_grams ?? 0 }
													onChange={ ( e ) => setItemQuantity( meal.id, index, Number( e.target.value ) || 0 ) }
													disabled={ isReadOnly }
												/>
											) : (
												<input
													className={ styles.qtyInput }
													type="number"
													min={ 0 }
													step={ 0.5 }
													value={ item.servings ?? 0 }
													onChange={ ( e ) => setItemServings( meal.id, index, Number( e.target.value ) || 0 ) }
													disabled={ isReadOnly }
												/>
											) }
											<div className="merodiet-mono" style={ { fontSize: '12px', color: 'var(--ink-faint)' } }>
												{ item.food_id ? __( 'g', 'merodiet' ) : __( 'srv', 'merodiet' ) }
											</div>
											{ ! isReadOnly && (
												<button className={ styles.removeBtn } onClick={ () => removeItem( meal.id, index ) } aria-label={ __( 'Remove item', 'merodiet' ) }>
													<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
														<path d="M18 6 6 18M6 6l12 12" />
													</svg>
												</button>
											) }
										</div>
									) ) }
								</div>
							);
						} ) }

						<div style={ { marginTop: '16px' } }>
							<h3 style={ { fontSize: '14px', fontWeight: 700, marginBottom: '10px' } }>{ __( 'Day totals', 'merodiet' ) }</h3>
							<div className={ styles.nutrientGrid }>
								<div className={ styles.nutrientTile }>
									<div className={ styles.nutrientVal }>{ formatAmount( summary.kcal, ' kcal' ) }</div>
									<div className={ styles.nutrientLbl }>{ __( 'Kcal', 'merodiet' ) }</div>
								</div>
								<div className={ styles.nutrientTile }>
									<div className={ styles.nutrientVal }>{ formatAmount( summary.protein ) }</div>
									<div className={ styles.nutrientLbl }>{ __( 'Protein', 'merodiet' ) }</div>
								</div>
								<div className={ styles.nutrientTile }>
									<div className={ styles.nutrientVal }>{ formatAmount( summary.carbs ) }</div>
									<div className={ styles.nutrientLbl }>{ __( 'Carbs', 'merodiet' ) }</div>
								</div>
								<div className={ styles.nutrientTile }>
									<div className={ styles.nutrientVal }>{ formatAmount( summary.fat ) }</div>
									<div className={ styles.nutrientLbl }>{ __( 'Fat', 'merodiet' ) }</div>
								</div>
							</div>
						</div>
					</PanelBody>
				</Panel>

				{ ! isReadOnly && (
					<Panel>
						<PanelHead>
							<h3>{ addingTo ? __( 'Add to', 'merodiet' ) + ' ' + MEAL_TYPES.find( ( m ) => m.id === addingTo )?.label : __( 'Select a meal slot', 'merodiet' ) }</h3>
						</PanelHead>
						<PanelBody>
							{ addingTo ? (
								<ItemSearch onSelectFood={ addFoodItem } onSelectRecipe={ addRecipeItem } />
							) : (
								<p style={ { fontSize: '12.5px', color: 'var(--ink-muted)' } }>
									{ __( 'Click "+ Add" on a meal above to search for a food or recipe.', 'merodiet' ) }
								</p>
							) }
						</PanelBody>
					</Panel>
				) }
			</div>
		</>
	);
}
```

- [ ] **Step 2: Write the CSS**

`src/screens/plans/PlanBuilder.module.css`:

```css
.grid {
	display: grid;
	grid-template-columns: 1fr 340px;
	gap: 16px;
}
@media (max-width: 900px) {
	.grid {
		grid-template-columns: 1fr;
	}
}

.nameRow {
	display: grid;
	grid-template-columns: 2fr 1fr 1fr;
	gap: 12px;
}
@media (max-width: 560px) {
	.nameRow {
		grid-template-columns: 1fr;
	}
}

.dayTabs {
	display: flex;
	gap: 6px;
	overflow-x: auto;
	margin-bottom: 16px;
	padding-bottom: 4px;
}
.dayTab {
	flex-shrink: 0;
	display: flex;
	flex-direction: column;
	align-items: center;
	font-family: inherit;
	font-size: 12.5px;
	font-weight: 600;
	padding: 8px 14px;
	border-radius: 8px;
	border: 1px solid var(--line-strong);
	background: var(--surface);
	color: var(--ink-muted);
	cursor: pointer;
}
.dayTab.isActive {
	background: var(--sage-wash);
	border-color: var(--sage-deep);
	color: var(--sage-deep);
}
.dayTabDate {
	font-size: 10.5px;
	font-weight: 400;
	color: var(--ink-faint);
}

.mealSection {
	margin-bottom: 18px;
}
.mealHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	border-bottom: 1px solid var(--line);
	padding-bottom: 6px;
	margin-bottom: 4px;
}
.mealHeader h3 {
	font-size: 13px;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--ink-muted);
}
.addBtn {
	font-family: inherit;
	font-size: 12px;
	font-weight: 600;
	color: var(--sage-deep);
	background: none;
	border: none;
	cursor: pointer;
}

.itemRow {
	display: grid;
	grid-template-columns: 1fr 70px 40px 28px;
	gap: 10px;
	align-items: center;
	padding: 8px 0;
	border-bottom: 1px solid var(--line);
}
.itemRow:last-child {
	border-bottom: none;
}
.qtyInput {
	width: 100%;
	font-family: inherit;
	font-size: 13px;
	padding: 5px 8px;
	border: 1px solid var(--line-strong);
	border-radius: 6px;
	background: var(--surface);
	color: var(--ink);
}
.removeBtn {
	width: 24px;
	height: 24px;
	border-radius: 6px;
	border: 1px solid var(--line-strong);
	background: var(--surface);
	color: var(--ink-muted);
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
}
.removeBtn svg {
	width: 13px;
	height: 13px;
}

.nutrientGrid {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 10px;
}
.nutrientTile {
	background: var(--paper-dim);
	border-radius: 8px;
	padding: 10px 12px;
}
.nutrientVal {
	font-family: 'IBM Plex Mono', monospace;
	font-size: 17px;
	font-weight: 600;
}
.nutrientLbl {
	font-size: 12px;
	color: var(--ink-muted);
	font-weight: 600;
	margin-top: 2px;
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npm run check-types`
Expected: no errors — pay particular attention to `draftItemFromApiItem`'s parameter type (`PlanItem`, the API shape) versus the local `DraftItem` shape; they're intentionally different (draft items use `label` instead of the two nullable label fields).

Run: `npx wp-scripts lint-js src/screens/plans/PlanBuilder.tsx --fix`
Expected: no remaining errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens/plans/PlanBuilder.tsx src/screens/plans/PlanBuilder.module.css
git commit -m "feat: add PlanBuilder screen (day tabs, meal sections, live nutrient panel)"
```

---

## Task 8: `AssignModal` — client picker + allergy check

**Files:**
- Create: `src/components/plans/AssignModal.tsx`
- Create: `src/components/plans/AssignModal.module.css`

**Interfaces:**
- Consumes: `Client`, `Plan` types; `store/clients`'s `getClients` selector (already-fetched list — no new endpoint).
- Produces: `<AssignModal isOpen={boolean} plan={Plan} clients={Client[]} onAssign={(clientId: number) => Promise<void>} onClose={() => void} />` — consumed by Task 9 (`PlanScreen`).

- [ ] **Step 1: Write the component**

`src/components/plans/AssignModal.tsx`:

```tsx
import { useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import Button from '../ui/Button';
import styles from './AssignModal.module.css';
import type { Client, Plan } from '../../types';

interface AssignModalProps {
	isOpen: boolean;
	plan: Plan;
	clients: Client[];
	onAssign: ( clientId: number ) => Promise< void >;
	onClose: () => void;
}

/**
 * Case-insensitive substring match of a client's declared allergies against
 * every item's label in the plan. Known limitation (see design spec): this
 * is not a real allergen taxonomy — it misses synonyms, plurals, and
 * category-level allergens (e.g. "tree nuts" won't catch "almonds" unless
 * the client's own allergy text says "almond"). Revisit if this proves
 * insufficient in practice.
 */
function findAllergyConflicts( plan: Plan, client: Client ): string[] {
	const itemLabels = plan.days
		.flatMap( ( day ) => day.items )
		.map( ( item ) => ( item.food_description ?? item.recipe_name ?? '' ).toLowerCase() );

	return client.allergies.filter( ( allergy ) => itemLabels.some( ( label ) => label.includes( allergy.toLowerCase() ) ) );
}

export default function AssignModal( { isOpen, plan, clients, onAssign, onClose }: AssignModalProps ) {
	const [ selectedClientId, setSelectedClientId ] = useState< number | null >( null );
	const [ isAssigning, setIsAssigning ] = useState( false );

	if ( ! isOpen ) {
		return null;
	}

	const selectedClient = clients.find( ( c ) => c.id === selectedClientId ) ?? null;
	const conflicts = selectedClient ? findAllergyConflicts( plan, selectedClient ) : [];

	const handleAssign = async () => {
		if ( ! selectedClientId ) {
			return;
		}
		setIsAssigning( true );
		try {
			await onAssign( selectedClientId );
		} finally {
			setIsAssigning( false );
		}
	};

	return (
		<div className={ styles.modalScrim } onClick={ ( e ) => e.target === e.currentTarget && onClose() }>
			<div className={ styles.modal }>
				<h3>{ __( 'Assign to client', 'merodiet' ) }</h3>

				<div className="merodiet-field" style={ { marginBottom: '14px' } }>
					<label htmlFor="merodiet-assign-client">{ __( 'Client', 'merodiet' ) }</label>
					<select
						id="merodiet-assign-client"
						value={ selectedClientId ?? '' }
						onChange={ ( e ) => setSelectedClientId( e.target.value ? Number( e.target.value ) : null ) }
					>
						<option value="">{ __( 'Select a client…', 'merodiet' ) }</option>
						{ clients.map( ( client ) => (
							<option key={ client.id } value={ client.id }>
								{ client.first_name } { client.last_name }
							</option>
						) ) }
					</select>
				</div>

				{ conflicts.length > 0 && (
					<p className={ styles.conflictWarning }>
						{ sprintf(
							/* translators: %s: comma-separated list of the client's declared allergies found in this plan */
							__( 'This plan contains an item matching this client’s declared allergies: %s. Assignment is blocked.', 'merodiet' ),
							conflicts.join( ', ' )
						) }
					</p>
				) }

				<div className={ styles.modalActions }>
					<Button
						variant="primary"
						onClick={ handleAssign }
						disabled={ ! selectedClientId || conflicts.length > 0 || isAssigning }
						style={ { justifyContent: 'center' } }
					>
						{ __( 'Assign', 'merodiet' ) }
					</Button>
					<Button variant="ghost" onClick={ onClose } disabled={ isAssigning } style={ { justifyContent: 'center' } }>
						{ __( 'Cancel', 'merodiet' ) }
					</Button>
				</div>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Write the CSS**

`src/components/plans/AssignModal.module.css`:

```css
.modalScrim {
	position: fixed;
	inset: 0;
	background: rgba(38, 38, 42, 0.4);
	z-index: 70;
	display: flex;
	align-items: center;
	justify-content: center;
}
.modal {
	background: var(--surface-raised);
	border-radius: 14px;
	width: 400px;
	max-width: calc(100vw - 40px);
	padding: 24px;
}
.modal h3 {
	font-size: 16px;
	margin-bottom: 16px;
}
.conflictWarning {
	font-size: 12.5px;
	color: var(--critical);
	background: var(--critical-wash, rgba(200, 60, 60, 0.08));
	border-radius: 8px;
	padding: 10px 12px;
	margin-bottom: 14px;
	line-height: 1.5;
}
.modalActions {
	display: flex;
	flex-direction: column;
	gap: 8px;
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npm run check-types`
Expected: no errors. If `--critical-wash` isn't a defined CSS variable in `src/styles/tokens.css`, the fallback `rgba(200, 60, 60, 0.08)` in the `var(...)` call covers it — check `tokens.css` for a `--critical-wash` token first and use it directly if one already exists (matches the pattern `--warning`/`--warning-wash` already used for `UnsavedBadge`).

Run: `npx wp-scripts lint-js src/components/plans/AssignModal.tsx --fix`
Expected: no remaining errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/plans/AssignModal.tsx src/components/plans/AssignModal.module.css
git commit -m "feat: add AssignModal (client picker + allergy conflict check)"
```

---

## Task 9: `PlanScreen` — wire it all together, and make it navigable

**Files:**
- Create: `src/screens/plans/PlanScreen.tsx`
- Modify: `src/admin/App.tsx`
- Modify: `JOURNEY.md`

**Interfaces:**
- Consumes: `store/plans` (Task 3), `store/clients` (existing), `PlanLibrary` (Task 6), `PlanBuilder` (Task 7), `AssignModal` (Task 8), `useQueryParam` (existing, built for Recipes).
- Produces: the `plans` view in `App.tsx`'s `VIEWS` registry now renders `<PlanScreen />` instead of `<ComingSoon />` — the feature becomes reachable from the sidebar.

- [ ] **Step 1: Write the screen**

`src/screens/plans/PlanScreen.tsx`:

```tsx
import { useState } from '@wordpress/element';
import { useSelect, useDispatch } from '@wordpress/data';
import { __ } from '@wordpress/i18n';
import { useQueryParam } from '../../hooks/useQueryParam';
import { STORE_NAME } from '../../store/plans';
import { STORE_NAME as CLIENTS_STORE } from '../../store/clients';
import AssignModal from '../../components/plans/AssignModal';
import PlanLibrary from './PlanLibrary';
import PlanBuilder from './PlanBuilder';
import type { Client, Plan, PlanInput } from '../../types';

interface PlansStoreSelectors {
	getPlans: () => Plan[];
	hasFinishedResolution: ( selector: string ) => boolean;
}

interface ClientsStoreSelectors {
	getClients: () => Client[];
}

export default function PlanScreen() {
	const [ idParam, setIdParam ] = useQueryParam( 'id' );
	const [ isAssignModalOpen, setAssignModalOpen ] = useState( false );

	const { plans, isLoading, clients } = useSelect( ( select ) => {
		const plansStore = select( STORE_NAME ) as unknown as PlansStoreSelectors;
		const clientsStore = select( CLIENTS_STORE ) as unknown as ClientsStoreSelectors;

		return {
			plans: plansStore.getPlans(),
			isLoading: ! plansStore.hasFinishedResolution( 'getPlans' ),
			clients: clientsStore.getClients(),
		};
	}, [] );

	const { createPlan, updatePlan, deletePlan, assignPlan } = useDispatch( STORE_NAME ) as {
		createPlan: ( data: PlanInput ) => Promise< Plan >;
		updatePlan: ( id: number, data: Partial< PlanInput > ) => Promise< Plan >;
		deletePlan: ( id: number ) => Promise< void >;
		assignPlan: ( id: number, clientId: number ) => Promise< Plan >;
	};

	const editingId = idParam && idParam !== 'new' ? Number( idParam ) : null;
	const editingPlan = plans.find( ( plan ) => plan.id === editingId ) ?? null;

	const openAdd = () => setIdParam( 'new' );
	const openEdit = ( id: number ) => setIdParam( String( id ) );
	const backToList = () => setIdParam( null );

	const handleSave = async ( data: PlanInput ) => {
		if ( editingPlan ) {
			await updatePlan( editingPlan.id, data );
		} else {
			const created = await createPlan( data );
			setIdParam( String( created.id ) );
			return;
		}
		backToList();
	};

	const handleDelete = ( plan: Plan ) => {
		// eslint-disable-next-line no-alert
		if ( window.confirm( __( 'Remove this plan? This cannot be undone.', 'merodiet' ) ) ) {
			deletePlan( plan.id );
		}
	};

	const handleAssign = async ( clientId: number ) => {
		if ( ! editingPlan ) {
			return;
		}
		await assignPlan( editingPlan.id, clientId );
		setAssignModalOpen( false );
	};

	if ( idParam !== null ) {
		return (
			<>
				<PlanBuilder
					key={ idParam }
					plan={ editingPlan }
					onSave={ handleSave }
					onCancel={ backToList }
					onAssignClick={ () => setAssignModalOpen( true ) }
				/>
				{ editingPlan && (
					<AssignModal
						isOpen={ isAssignModalOpen }
						plan={ editingPlan }
						clients={ clients }
						onAssign={ handleAssign }
						onClose={ () => setAssignModalOpen( false ) }
					/>
				) }
			</>
		);
	}

	return (
		<PlanLibrary plans={ plans } clients={ clients } isLoading={ isLoading } onAdd={ openAdd } onEdit={ openEdit } onDelete={ handleDelete } />
	);
}
```

- [ ] **Step 2: Wire it into `App.tsx`**

In `src/admin/App.tsx`, replace the `plans` entry in `VIEWS`:

```ts
	plans: { render: () => <PlanScreen /> },
```

and add the import alongside the other screen imports:

```ts
import PlanScreen from '../screens/plans/PlanScreen';
```

(`ComingSoon` stays imported and used for `foods`/`settings` — don't remove that import.)

- [ ] **Step 3: Update `JOURNEY.md`**

Change the sidebar list entry:

```
3. **Plans** — meal-plan list + a dedicated full-screen Plan Builder mode (built)
```

Wait — the design decision this session was to keep Plans inside the sidebar shell, not full-screen (deviating from the original spec text). Update the numbered sidebar list entry to:

```
4. **Plans** — meal-plan list + day-by-day builder, inside the standard sidebar shell (built)
```

And replace the existing "Plans (placeholder)" and "Plan Builder (full-screen...)" sections with one combined, accurate section:

```markdown
### Plans (built)
- **Purpose:** list existing meal plans; open a day-by-day builder to create/edit one, then assign it to a client.
- **Primary content:** table of plan/client/date-range/avg. daily kcal/status; day tabs (auto-generated from the plan's start/end date) with Breakfast/Lunch/Dinner/Snack meal sections, a sticky per-day nutrient-totals panel, an "Assign to client" action.
- **Primary action:** "New plan" (top-right, own topbar row).
- **Note:** unlike the original spec, this stays inside the standard sidebar shell (not a separate full-screen mode) — decided during this feature's design pass for consistency with every other screen.
- **Allergy check:** runs only at the moment of assignment (the builder itself never has a client attached until then) — a case-insensitive substring match of the client's declared allergies against every item's name in the plan. Known limitation: not a real allergen taxonomy (misses synonyms, plurals, category-level allergens like "tree nuts" not auto-catching "almonds").
- **Assigned plans are read-only.** The backend rejects edits to an assigned plan (409); the builder mirrors that by disabling every input rather than only showing the error after a failed save.
```

- [ ] **Step 4: Type-check and lint**

Run: `npm run check-types`
Expected: no errors.

Run: `npx wp-scripts lint-js src/screens/plans/PlanScreen.tsx src/admin/App.tsx --fix`
Expected: no remaining errors.

- [ ] **Step 5: Manual verification in the browser**

With `npm start` running (dev server) and the WordPress site open:

1. Go to Plans → "New plan" → set a title and a 3-day date range → confirm 3 day tabs appear, labeled with the correct dates.
2. On Day 1, click "+ Add" on Breakfast → "USDA Foods" tab → search and add a food → set quantity to 150g → confirm the "Day totals" panel updates immediately.
3. Switch to the "My Recipes" tab, add a recipe to Lunch on Day 2 → set servings to 2 → switch to Day 2's tab → confirm its totals reflect that recipe scaled ×2, and Day 1's totals are unaffected.
4. Click "Create plan" → confirm it saves, the URL now has `&id=<the new id>`, and reloading the page still shows the same plan.
5. Click "Assign to client" → pick a client with no matching allergy → confirm assignment succeeds and the builder becomes fully read-only (no inputs, no Save button).
6. Create a second plan, add an ingredient whose name matches one of a different client's declared allergies, then try to assign to that client → confirm the assignment is blocked with a message naming the allergen.
7. Go back to the Plans list → confirm the assigned plan shows the client's name, correct status chip, and a sensible avg. kcal/day figure.

- [ ] **Step 6: Commit**

```bash
git add src/screens/plans/PlanScreen.tsx src/admin/App.tsx JOURNEY.md
git commit -m "feat: wire up the Plans screen end-to-end"
```
