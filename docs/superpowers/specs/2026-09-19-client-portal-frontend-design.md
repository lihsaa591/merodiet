# Client-Portal Frontend — Design

## Purpose

Give a client (role `nutrition_client`) a branded, front-end (not wp-admin) React portal to view their assigned plan, log compliance, and log measurements — consuming the `/me/plan`, `/me/logs`, `/me/measurements` REST endpoints already built (PR #5). Multilingual from day one via the same `@wordpress/i18n` mechanism the practitioner admin app already uses. Extensible on both the PHP and JS sides so a future add-on or contributor can add a new portal section without touching core files.

## Why not wp-admin

A `nutrition_client` user has only the `read` and `view_own_nutrio_plan` capabilities (see `RoleRegistrar::CLIENT_CAPS`) — no `manage_options`-adjacent capability at all. Routing them into `/wp-admin/` would show a near-empty, broken-looking dashboard with none of the menu items a real admin sees. A dedicated front-end surface, outside wp-admin entirely, is the only option that looks intentional.

## URL & routing (permalink-structure-agnostic)

WordPress sites vary in permalink structure — Plain (`?p=123`), Post name, Day/name, or a fully custom structure — and a rewrite rule alone does nothing under Plain, since the rewrite engine isn't engaged at all in that mode. To work under every structure:

- Register a public query var, `nutrio_portal`, on `init` via `add_filter( 'query_vars', ... )`.
- Register a pretty rewrite rule, `^client-portal/?$` → `index.php?nutrio_portal=1`, via `add_rewrite_rule()` on `init` (flushed on activation, matching the existing `Activation::activate()` pattern) — this only ever matters when pretty permalinks are active; it's additive, never load-bearing.
- Hook `template_redirect` and check `get_query_var( 'nutrio_portal' )` directly — this fires regardless of which permalink structure produced the request, so Plain-permalink sites reaching `/?nutrio_portal=1` work identically to pretty-permalink sites reaching `/client-portal/`.
- A `PortalPage::url(): string` helper builds the correct form for the current site: `home_url( '/client-portal/' )` when `get_option( 'permalink_structure' )` is non-empty, else `home_url( '/?nutrio_portal=1' )` — used everywhere else in the codebase that needs to link to the portal (e.g. a future "view portal" link on the practitioner's client-detail screen).

On `template_redirect`, `PortalPage`:
- Logged out → renders a minimal branded login form (WP's own `wp_signon()` handles the POST; no custom auth code).
- Logged in as `nutrition_client` → renders the bare HTML shell + mount div (see below) and `exit`s, short-circuiting the rest of WordPress's template hierarchy — this is a full-page takeover, not a theme template, matching how the wp-admin mount point already works for the practitioner side.
- Logged in as anything else (practitioner, admin) → redirects to `/wp-admin/` — this URL isn't for them.
- `login_redirect` filter: after a successful login, if the authenticating user has the `view_own_nutrio_plan` capability, redirect to `PortalPage::url()` instead of the default `/wp-admin/` redirect.

## Frontend architecture

- New webpack entry `client-portal` → `src/client-portal/index.tsx`, added to `webpack.config.js`'s `entry` map alongside the existing `admin` entry — same build pipeline, same `@wordpress/scripts` config, just a second bundle.
- `index.tsx` mirrors `src/admin/index.tsx`'s existing bootstrap: mount into the shell's div, read `window.nutrioClientPortal` (a new, separate localized-data global — deliberately not reusing `window.nutrioAdmin`, since this is a different user/security context with a much smaller, client-safe data surface: no `restNonce`-adjacent secrets beyond what a client's own session already implies).
- `App.tsx`: tab state (`'plan' | 'log' | 'measurements'`), renders a simple top nav + the active tab's screen component. No React Router — matches the "single mount, view state" pattern already used by the practitioner admin app's `App.tsx`.
- Three screen components: `PlanTab.tsx`, `LogTab.tsx`, `MeasurementsTab.tsx`, each fetching via `@wordpress/api-fetch` against the `/me/*` routes — same client library already used throughout the practitioner side, so no new dependency.

### Log tab (plan-first, per your answer)

- Fetches `GET /me/plan`; if a plan exists, lists today's items (matched by the plan's `day_offset` against how many days into `[start_date, end_date]` today falls) each with "Mark eaten" / "Mark substituted" / "Skip" buttons — each posts `{ plan_item_id, food_id/recipe_id, quantity_grams/servings (copied from the plan item), log_date: today, status }` to `POST /me/logs`.
- Below that, a "Log something else" collapsible form: food/recipe search is NOT built in v1 (the practitioner-side `FoodSearch`/`ItemSearch` components are practitioner-capability-gated and out of scope here) — instead, a simple free-text `notes` + `log_date` + `status` entry with no `food_id`/`recipe_id`, which the backend already supports (both are optional/nullable). This keeps v1 shippable without duplicating the food-search UI for a different capability context; upgrading "log something else" to a real food search is a natural, clearly-scoped follow-up.
- If no plan exists (`GET /me/plan` returns `null`), the tab shows an empty state ("No plan assigned yet — check back once your practitioner assigns one") and the ad-hoc "Log something else" form still works standalone.

### Measurements tab (weight only, per your answer)

- A simple form: `measured_at` (defaults to today), `weight_grams` (client enters a value in their preferred unit — kg or lb toggle stored as a per-viewer `localStorage` preference only, converted to grams before `POST /me/measurements`), optional `notes`.
- Below the form, a plain list of past measurements (`GET /me/measurements`), most recent first, displayed in the same unit preference.

### Plan tab

- `GET /me/plan`; if present, renders the plan's days/items read-only (title, date range, per-day items with the `food_description`/`recipe_name` and nutrients the backend already attaches) — no editing, a client never edits their own plan.
- Empty state matches the Log tab's ("No plan assigned yet").

## Extensibility

**PHP side** (mirrors the existing `do_action`/`apply_filters` convention, e.g. `nutrio_client_before_create`):
- `apply_filters( 'nutrio_client_portal_bootstrap_data', array $data, WP_User $client_user ): array` — filters the localized `window.nutrioClientPortal` payload before it's output, so an add-on can inject extra config data for its own JS-side section.
- `do_action( 'nutrio_client_portal_render', WP_User $client_user )` — fires right before the mount div is output, letting an add-on `wp_enqueue_script()` its own bundle on this exact page load.

**JS side** (new — via `@wordpress/hooks`, the same library WordPress core/Gutenberg uses, already a transitive dependency of `@wordpress/element`/`@wordpress/data`, so no new package):
- `applyFilters( 'nutrio.clientPortal.sections', defaultSections )` in `App.tsx` — `defaultSections` is the built-in `[{id:'plan',...}, {id:'log',...}, {id:'measurements',...}]` array; an add-on's own bundle (enqueued via the PHP action above) calls `addFilter( 'nutrio.clientPortal.sections', 'my-addon/extra-tab', (sections) => [...sections, {id:'my-tab', label:..., component: MyComponent}] )` before `App.tsx` reads the filtered list, giving genuine "a plugin can add a new tab" extensibility without needing PHP to describe a React component.
- `doAction( 'nutrio.clientPortal.mounted' )` once on initial render, and `doAction( 'nutrio.clientPortal.logCreated', entry )` / `doAction( 'nutrio.clientPortal.measurementCreated', entry )` after each successful POST — lets an add-on react to portal events (e.g. a future analytics or notification add-on) without patching core screen components.

## i18n

Every user-facing string goes through `__( '...', 'nutrio' )` from `@wordpress/i18n`, identical to the practitioner admin app. `AdminPage`'s existing `wp_set_script_translations()` call pattern is replicated for the new `client-portal` script handle, pointing at the same `languages/` directory Nutrio already uses — one translation catalog covers both apps, since they share the same textdomain.

## Data flow & security

- `PortalPage`'s logged-in branch only ever localizes data for `get_current_user_id()`'s own linked client row (via `ClientRepository::find_for_user()`, already built) — never accepts a client identifier from the URL or query string. Same "server-resolved identity, never trusted input" posture as the `/me/*` REST layer it calls into.
- All `/me/*` calls from the React app carry the browser's existing WP auth cookie + a REST nonce localized into `window.nutrioClientPortal.restNonce`, exactly like the practitioner side's `window.nutrioAdmin.restNonce` — no new auth mechanism.

## Non-goals (this pass)

- Food/recipe search in the "log something else" form (free-text notes only for v1, per above).
- Editing or deleting past log entries/measurements (create + list only, matching the backend's own v1 scope).
- A generic "any add-on can inject a real PHP-described component" system — the filter/action hook pair above gives genuine extensibility, but an add-on still ships its own compiled JS to add a tab, same as how Gutenberg block extensibility works.
- Push notifications, reminders, or any client-facing settings/profile page beyond what's described above.

## Testing

- PHP: a test for `PortalPage::url()`'s two branches (pretty vs. plain permalink structure) using Brain Monkey to stub `get_option( 'permalink_structure' )`.
- PHP: a test proving `template_redirect`'s three branches (logged out, `nutrition_client`, any other role) each short-circuit correctly — reuse the `AbstractClientControllerTest`-style Brain Monkey mocking already established.
- JS: no test runner currently exists for React component behavior in this codebase (only `tsc --noEmit` and ESLint are wired up) — matching that existing project convention, no new component-level test infrastructure is introduced in this pass; `check-types` and `lint-js` passing is the bar, same as every other screen in the practitioner app.
