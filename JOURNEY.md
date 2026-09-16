# JOURNEY.md — Nutrio Admin Dashboard

## Job to be done

A registered dietitian/nutritionist manages an active client caseload: track who's complying with their plan, build/maintain a recipe library backed by real USDA nutrient data, and assemble day-by-day meal plans they can safely assign — without losing the clinical thread (allergies, restrictions, plan status) across dozens of clients.

## Information architecture

Full-screen app (hides the standard wp-admin chrome; a "Back to WordPress" link is the deliberate escape hatch). Left sidebar, top-to-bottom:

1. **Dashboard** — practitioner's morning check-in
2. **Clients** — roster CRUD (built, wired to the live REST API)
3. **Recipes** — recipe library + builder, backed by live USDA food search (built)
4. **Plans** — meal-plan list + day-by-day builder, inside the standard sidebar shell (built)
5. **Food database** — cached USDA lookups (stub page)
6. **Settings** — USDA API key, practice details (stub page)
7. **Analytics** *(Pro-locked)* — future advanced reporting, gated by the shared upsell modal

Theme toggle (light/dark) and current-user identity live in the sidebar footer.

## Page specs

### Dashboard
- **Purpose:** answer "what needs my attention today" in one glance.
- **Primary content:** 4-tile KPI row (Active clients, Logged today, Plans awaiting review, Recipe library) — Active clients is wired to real data, the other three are placeholder pending log-entry/plan endpoints; client compliance list (last 7 days, currently placeholder data).
- **Primary action:** none forced — this is a scan-first page, not a task page.
- **Empty state:** zero clients yet → KPI reads 0, compliance list replaced with a single "Add your first client" prompt linking to Clients.

### Clients (built)
- **Purpose:** the roster — who's on it, their goals/allergies, quick edit/remove.
- **Primary content:** rows with avatar + name, email, allergy chips, status pill.
- **Primary action:** "Add client" (top-right, in the same topbar row as the title), opens a slide-in drawer form.
- **Empty state:** "No clients yet. Add your first client to get started." + the Add client button.
- **By design, "Add client" does not create a WordPress user account.** A client here is a lightweight roster record in `wp_nutrio_clients`, deliberately separate from wp-admin → Users. The `clients` table's nullable `user_id` column is reserved for Phase 3 (client portal): an "Invite client" action that creates a real WP user with the `nutrition_client` role, links it via that column, and sends login access — not built yet.
- **Not yet built — client-uploaded profile picture:** deferred to Phase 3 alongside the client portal itself, since a client can't upload anything without a login to upload it through. Once the portal exists, a client-set photo should show wherever the client's avatar currently appears in the admin (roster, plan assignment, etc.) in place of the generated initials avatar.

### Recipes (built)
- **Purpose:** build/maintain a reusable recipe library with live nutrient totals.
- **Primary content:** ingredient list + per-serving nutrient tiles on the left (updates live as ingredients change, ahead of the server's authoritative save-computed totals); live USDA food search on the right.
- **Primary action:** "New recipe" (top-right, own topbar row).
- **Not yet built — manual ingredient entry:** some ingredients (a client's specific branded product, a homemade blend, a supplement) won't be in USDA's database. Plan is to support it as another food `source` (e.g. `custom`) alongside USDA — same `ResolvedFood`/`RecipeItem` pipeline, practitioner enters name + the 4 macros per 100g, and it's visibly tagged "Custom" (vs. "USDA") in the UI so a saved number's provenance is never ambiguous in a clinical tool.

### Plans (built)
- **Purpose:** list existing meal plans; open a day-by-day builder to create/edit one, then assign it to a client.
- **Primary content:** table of plan/client/date-range/avg. daily kcal/status; day tabs (auto-generated from the plan's start/end date) with Breakfast/Lunch/Dinner/Snack meal sections, a sticky per-day nutrient-totals panel, an "Assign to client" action.
- **Primary action:** "New plan" (top-right, own topbar row).
- **Note:** unlike the original spec, this stays inside the standard sidebar shell (not a separate full-screen mode) — decided during this feature's design pass for consistency with every other screen.
- **Allergy check:** runs only at the moment of assignment (the builder itself never has a client attached until then) — a case-insensitive substring match of the client's declared allergies against every item's name in the plan. Known limitation: not a real allergen taxonomy (misses synonyms, plurals, category-level allergens like "tree nuts" not auto-catching "almonds").
- **Assigned plans are read-only.** The backend rejects edits to an assigned plan (409); the builder mirrors that by disabling every input rather than only showing the error after a failed save.

### Food database → Custom foods (built)
- **Purpose:** manual entry for ingredients not in USDA's database — a client's specific branded product, a homemade blend. Repurposed from the originally-planned "browse the USDA cache" concept (low value: a read-only list with no action) into something that actually closes a known gap.
- **Primary content:** table of the current practitioner's own custom foods (Name, Calories, Protein, Carbs, Fat) + a Drawer form (Name required, ~13 curated optional nutrient fields grouped Macros / Vitamins & minerals). Custom foods are scoped per-practitioner — one practitioner's entries aren't visible to another.
- **Primary action:** "Add custom food" (top-right, own topbar row).
- **Integration point:** the Recipe builder's ingredient search (`FoodSearch`) has a "USDA" / "My custom foods" toggle, so a custom food is usable in a recipe the same way a USDA food is.
- **Deleting a custom food still used in a recipe is blocked** (409), the same pattern as an assigned plan blocking edits — silently orphaning a recipe's nutrient total would be worse than refusing the delete.
- **Not USDA cache browsing.** There's still no UI to inspect the raw USDA-sourced cache (`wp_nutrio_foods` rows with `source = 'usda'`) — that idea was deliberately dropped as low-value; see this feature's design discussion for the reasoning.

### Settings (built)
- **Purpose:** USDA API key today; practice details and licensing still deferred.
- **Primary content:** single section (no tabs yet — added only once there's a second section worth grouping). Shows a masked preview (`••••1234`) if a key is already set, with a "Replace key"/"Add key" action that reveals the input. The raw key is never sent back to the browser once saved.

## Responsiveness (applies to every page above)

The admin app must work down to phone width, not just desktop — see DESIGN.md's Responsive behavior section for the two breakpoints and what changes at each. The not-yet-built client-portal frontend (a future phase — clients log meals, view their assigned plan) carries this requirement even more heavily, since clients are more likely to use it on a phone than a practitioner is to use the admin on one.

## Every screen owns its own topbar

A real bug found during review: the app shell used to render a generic title bar per screen in addition to each screen rendering its own (with a primary action button) — producing a duplicated title and the action button landing in the wrong row. Fixed by making every screen fully responsible for its own topbar (title + any primary action, in one row); the app shell never renders a competing one. Keep this in mind when building Recipes/Plans — each needs its own topbar with its own "New recipe"/"New plan" button, following the Clients pattern exactly.
