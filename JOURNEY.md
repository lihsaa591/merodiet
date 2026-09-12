# JOURNEY.md — Nutrio Admin Dashboard

## Job to be done

A registered dietitian/nutritionist manages an active client caseload: track who's complying with their plan, build/maintain a recipe library backed by real USDA nutrient data, and assemble day-by-day meal plans they can safely assign — without losing the clinical thread (allergies, restrictions, plan status) across dozens of clients.

## Information architecture

Full-screen app (hides the standard wp-admin chrome; a "Back to WordPress" link is the deliberate escape hatch). Left sidebar, top-to-bottom:

1. **Dashboard** — practitioner's morning check-in
2. **Clients** — roster CRUD (built, wired to the live REST API)
3. **Recipes** — recipe library + builder, backed by live USDA food search (not yet built — placeholder)
4. **Plans** — meal-plan list + a dedicated full-screen Plan Builder mode (not yet built — placeholder)
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

### Recipes (placeholder)
- **Purpose:** build/maintain a reusable recipe library with live nutrient totals.
- **Primary content:** ingredient list + per-serving nutrient tiles on the left; live USDA food search on the right (per the mockup — not yet implemented).
- **Primary action:** "New recipe" (top-right, own topbar row, once built).

### Plans (placeholder)
- **Purpose:** list existing meal plans; open the dedicated full-screen builder to create/edit one.
- **Primary content:** table of plan/client/date-range/avg. daily kcal/status; clicking a row opens the Plan Builder (per the mockup — not yet implemented).
- **Primary action:** "New plan" (top-right, own topbar row, once built).

### Plan Builder (full-screen, not a sidebar-nav page — not yet built)
- **Purpose:** day-by-day meal composition with live nutrient totals and an allergy safety check.
- **Primary content:** day tabs, meal blocks (breakfast/lunch/dinner) with ingredient/recipe line items, a sticky nutrient-totals panel, an allergy-safety flag.
- **Primary action:** "Assign to client" (locks the plan, freezes its nutrient snapshot).
- **Pro-gated action:** "Generate with AI" — locked, opens the shared Pro upsell modal.

### Food database (stub)
- **Purpose:** transparency into the cached USDA lookups recipes draw from.
- **Primary content:** deferred — currently a single explanatory placeholder line.

### Settings (stub)
- **Purpose:** USDA API key and practice-level configuration.
- **Primary content:** USDA API key field today; practice details and licensing deferred.

## Responsiveness (applies to every page above)

The admin app must work down to phone width, not just desktop — see DESIGN.md's Responsive behavior section for the two breakpoints and what changes at each. The not-yet-built client-portal frontend (a future phase — clients log meals, view their assigned plan) carries this requirement even more heavily, since clients are more likely to use it on a phone than a practitioner is to use the admin on one.

## Every screen owns its own topbar

A real bug found during review: the app shell used to render a generic title bar per screen in addition to each screen rendering its own (with a primary action button) — producing a duplicated title and the action button landing in the wrong row. Fixed by making every screen fully responsible for its own topbar (title + any primary action, in one row); the app shell never renders a competing one. Keep this in mind when building Recipes/Plans — each needs its own topbar with its own "New recipe"/"New plan" button, following the Clients pattern exactly.
