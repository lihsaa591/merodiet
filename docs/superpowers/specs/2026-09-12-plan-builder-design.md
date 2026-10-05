# Plan Builder — Design

## Context

Recipes just shipped. Plans is the next screen per `JOURNEY.md`/the original roadmap — the other half of "build and assign nutrition." The backend is already almost entirely built: `merodiet_plans` / `merodiet_plan_days` / `merodiet_plan_items` migrations, `PlanRepository`, `PlanNutrientResolver`, and a full `PlansController` (list/create/get/update/delete/assign, ownership checks, 409 on editing an assigned plan). What's missing is the frontend, plus one real backend gap described below.

A plan is a **draft** (freely editable, nutrient totals always computed live) until it's **assigned** to a client, at which point `assigned_at` is set and `nutrient_snapshot` is frozen — an assigned plan must keep rendering the values the practitioner actually reviewed and the client actually received, even if the underlying USDA cache is later corrected. `client_id` is nullable and, notably, **not settable during create/update** — only the dedicated `POST /plans/{id}/assign` endpoint sets it. A plan is client-agnostic until that one explicit action.

## Backend fix

`PlansController::with_totals()` (private method) becomes `with_details()`, same fix pattern already applied to `RecipesController`. It additionally attaches:

- `days`: each with `day_offset` and its `items`
- each item gets a human-readable label attached — `food_description` (via `FoodCache::find()`) for a direct-food item, or `recipe_name` (via `RecipeRepository::find()`) for a recipe item — so the frontend never resolves raw `food_id`/`recipe_id` itself.

No other backend method needs to change — `PlanRepository::days_for_plan()` / `items_for_day()` and `PlanNutrientResolver` already expose everything needed.

## Frontend architecture

Mirrors the Recipes pattern (now the established convention):

- **`src/store/plans/`** — `reducer`/`actions`/`resolvers`/`selectors`/`index`, thunks (not generators), same shape as `store/recipes`.
- **`src/screens/plans/PlanScreen.tsx`** — orchestrates list ↔ builder via `useQueryParam('id')` (built for Recipes, reused here — deep-linkable/refresh-safe from day one).
- **`src/screens/plans/PlanLibrary.tsx`** — table list (title, client name once assigned, date range, avg. daily kcal, status pill), own topbar with "New plan".
- **`src/screens/plans/PlanBuilder.tsx`** — the complex screen: `title`/`start_date`/`end_date` + a `days` array (each day: 4 fixed meal-type buckets), day-tab navigation, a sticky per-day nutrient panel, `useGlobalDirtyState` + `UnsavedBadge` (the guard built this session), and a fully read-only mode when `plan.status === 'assigned'`.
- **`src/screens/plans/ItemSearch.tsx`** — a separate component (not folded into the builder), two tabs: "My Recipes" (client-side filter over the already-fetched `recipes` store) and "USDA Foods" (reuses the existing `FoodSearch` component).
- **`src/components/plans/AssignModal.tsx`** — client picker + allergy check, opened by the builder's "Assign to client" button.

## Day/meal editing UX

- Day tabs auto-generate from `start_date`/`end_date` — this is the decided behavior after considering how practitioners actually think about meal plans (a concrete date range, not an abstract day count). Labeled "Day 1 · Mon, Sep 14" (date computed client-side as `start_date + day_offset`, never stored separately). Shrinking the date range drops trailing days — confirm first if any dropped day has items (real data loss); growing it appends empty days.
- Each day always shows all 4 meal-type sections (Breakfast/Lunch/Dinner/Snack), each an ingredient-row list styled like `RecipeBuilder`'s, each with its own "+" opening `ItemSearch` scoped to that slot.
- Adding a **food** item asks for quantity in grams (matches Recipes); adding a **recipe** item asks for number of servings (server-side, `PlanNutrientResolver::calculate_recipe_servings_totals()` already scales a recipe's per-serving totals by this number).
- The sticky nutrient panel shows **only the currently open day's totals** (not a whole-plan average — the Plans list's "avg. daily kcal" column already covers that view) — a live client-side estimate, generalized from the `estimateNutrientsPerServing`-style math built for Recipes to handle a mix of direct-food and recipe-servings items in one day.

## Assign flow + allergy check

Since the builder never has a client attached until assignment, the allergy check happens **only at assign time**, not live while drafting (rejected alternative: an optional "preview client" while drafting — more UI, not worth it for v1).

`AssignModal` opens from the builder's "Assign to client" button (visible only on a saved draft): client picker (already-fetched `clients` store) → on selection, cross-check that client's `allergies` against every food/recipe ingredient name in the plan (case-insensitive substring match) → any match blocks assignment with a message naming the allergen and where it was found → no match calls `POST /plans/{id}/assign`.

**Known limitation, flagged deliberately, not a gap to silently fix later:** this is a substring match over ingredient *names*, not a real allergen taxonomy — it will miss synonyms, plurals, and category-level allergens (e.g. a client's "tree nuts" allergy won't automatically catch "almonds" unless "almond" is literally in the client's allergy text). A real allergen taxonomy is future work, out of scope here.

## Read-only assigned view

Opening an already-assigned plan renders the same builder layout but every input is disabled/removed — no add/remove/edit controls, no Save button, no re-assign. Matches the backend's 409-on-edit being enforced, not just suggested. (Rejected alternative: a "Duplicate as new draft" action — useful, but extra scope; can be added later if a real need shows up.)

## Verification plan

- `check-types` / `lint-js` clean, `php -l` on touched files.
- Live walkthrough in browser: create a plan with a date range → day tabs match → add a food item and a recipe item to different meal slots on different days → nutrient panel updates live per day → save → reload → confirm days/items round-trip correctly through the fixed `with_details()` → assign to a client with a matching allergy → confirm blocked → assign to a client without conflicts → confirm success and that the plan is now read-only.
- No new automated tests planned — `PlanNutrientResolverTest.php` already covers the nutrient math; the gap being closed is REST response shape + frontend, verified by hand in-browser (this project's established verification approach throughout).
