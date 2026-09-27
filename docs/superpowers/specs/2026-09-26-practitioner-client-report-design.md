# Practitioner Client Detail & Compliance Dashboard — Design Spec

## Context

Nutrio's admin roster (`src/screens/clients/ClientRoster.tsx`) currently only
lets a practitioner edit a client's name, email, goals, allergies, and
dietary restrictions. There is no way to see a client's assigned plan,
logged compliance (eaten/skipped/substituted), or measurement history from
the practitioner side — only the client themselves can see this, through
the client portal's own `/me/*` self-service endpoints.

Separately, the admin Dashboard (`src/screens/dashboard/Dashboard.tsx`) has
a "Logged today" KPI, a "Plans awaiting review" KPI, and a "Client
compliance, last 7 days" panel — all hardcoded placeholder data, confirmed
by the screen's own code comment (lines 10-12) explaining these predate the
client-portal backend.

This spec designs both together, since they share the same underlying
compliance calculation and repository methods.

## Goals

- A practitioner can open any client from the roster and see: their
  currently active plan (if any), a compliance percentage, recent log
  history, and recent measurement history with trend deltas.
- The Dashboard's KPIs and compliance panel show real data.
- Reuse existing repository methods, REST controller patterns, and
  frontend components (Skeleton, the load-more date-widening pattern, the
  KPI tile style) rather than inventing new ones.

## Non-goals

- No charting library — measurement trends are a list with `↑`/`↓` deltas,
  matching the client portal's own Measurements tab, not a line chart.
- No cross-plan compliance aggregation. Compliance is computed against the
  client's single currently-active plan (if any) intersected with the
  requested window. A client with no active plan is excluded from the
  percentage and shown separately as "no active plan," not given a 0%.
- No pagination redesign — log/measurement history in the new screen reuses
  the same "load more" (widen the date range, refetch) pattern already
  established in the client portal's Log and Measurements tabs.
- Not touching the client-portal side at all — this is entirely
  practitioner-facing.

## Backend

### Three new sub-routes on `ClientsController`

Following the existing `/invite` sub-route pattern exactly (see
`ClientsController.php:108-115` and its handler at `invite_client()`,
`ClientsController.php:242-258`): resolve the client via
`find_for_practitioner( $id, $this->current_practitioner_id() )`, call
`$this->assert_owns( $client )`, return early if not `true`, then act.

```
GET /clients/{id}/logs?from=YYYY-MM-DD&to=YYYY-MM-DD
GET /clients/{id}/measurements?from=YYYY-MM-DD&to=YYYY-MM-DD
GET /clients/{id}/compliance?from=YYYY-MM-DD&to=YYYY-MM-DD
```

`/logs` and `/measurements` are thin wrappers:
`LogEntryRepository::all_for_client( $client_id, [ 'from' => ..., 'to' => ... ] )`
and `MeasurementRepository::all_for_client( $client_id, [ 'from' => ..., 'to' => ... ] )`
respectively — both methods already support this exact filter shape
(`LogEntryRepository.php:74`, `MeasurementRepository.php:66`). No new
repository code needed for these two.

`/compliance` is new logic:

1. Find the client's active plan via
   `PlanRepository::find_active_for_client( $client_id, $to )` (using the
   window's end date as the reference date — if the plan was active at any
   point up to `$to`, per that method's existing `start_date <= %s AND
   end_date >= %s` query at `PlanRepository.php:115`, adjusted so the
   window's `$to` is the reference "today").
2. If no active plan: return `{ plan: null, percent: null, logged_count: 0,
   total_count: 0, window: { from, to } }`.
3. If an active plan exists: intersect its `[start_date, end_date]` with
   the requested `[from, to]` window (clamp to the overlap). For each day
   in that overlap, resolve its calendar date (`plan.start_date +
   day_offset` days) and fetch its items via `PlanRepository::items_for_day()`
   (`PlanRepository.php:283`) for the matching day. Sum `total_count`
   across all those days' items.
4. Fetch the client's log entries in the same overlap window via
   `LogEntryRepository::all_for_client()`, filtered to rows where
   `plan_item_id` is not null (ad-hoc, non-plan log entries don't count
   toward plan compliance). `logged_count` = the count of plan items that
   have at least one matching log entry (matched by `plan_item_id`) in that
   set — a plan item logged more than once (e.g. corrected) still counts
   once.
5. `percent = total_count > 0 ? round( logged_count / total_count * 100 )
   : null`.

This computation is new code, not a repository method refactor — it lives
in the `ClientsController` handler itself (or a small private helper on
that controller), since it's the only consumer.

### One dashboard-only aggregate endpoint

```
GET /dashboard/overview
```

Registered on whichever controller already owns dashboard-level concerns
(if none exists yet, a new small `DashboardController` following the same
`AbstractPractitionerController` pattern as every other controller). No
`{id}` param — scoped implicitly to `current_practitioner_id()`. Returns:

```json
{
  "active_client_count": 12,
  "clients_without_plan_count": 3,
  "logged_today_count": 8,
  "draft_plan_count": 2,
  "compliance": [
    { "client_id": 7, "name": "Jordan Mackey", "percent": 40 },
    { "client_id": 3, "name": "Elena Cho", "percent": 100 }
  ]
}
```

- `active_client_count`: count of clients with `status = 'active'` (however
  the roster already defines "active" — reuse its existing filter, don't
  invent a new status).
- `clients_without_plan_count`: count of active clients where
  `PlanRepository::find_active_for_client()` returns `null` for today.
- `logged_today_count`: count of active clients **with an active plan**
  who have at least one log entry (any status) with `log_date = today` —
  deliberately scoped to only clients with a plan, matching the "Logged
  today" KPI's denominator below (a client with no plan has nothing to log
  against, so counting their ad-hoc entries here would let the numerator
  exceed the denominator).
- `draft_plan_count`: `PlanRepository::all_for_practitioner( $practitioner_id,
  1, 1, [ 'status' => 'draft' ] )['total']` — reuses the existing
  `all_for_practitioner()` method (`PlanRepository.php:207`) already used
  by the Plan Builder's own list view, just filtered and read for its
  `total` count.
- `compliance`: for every active client with an active plan (today, last 7
  days window), the same per-client calculation as `/clients/{id}/compliance`
  above, sorted ascending by `percent` (lowest first, so clients needing
  follow-up surface immediately). This is straightforward N calls to the
  same compliance logic looped over the roster — acceptable at the scale
  this plugin targets (tens of clients per practitioner, not thousands);
  revisit only if that assumption changes.

## Frontend

### Client-detail screen (`?view=clients&id={id}`)

New file `src/screens/clients/ClientDetail.tsx`, wired into
`ClientRoster.tsx` by making each roster row's click navigate here (via the
same `useQueryParam( 'id' )` pattern `PlanScreen.tsx` already uses for its
builder mode) instead of opening the edit modal directly. Layout,
top-to-bottom:

1. **Header**: client name, a status badge, an "Edit" button (opens the
   existing edit form/modal unchanged — reused, not rebuilt) and a "Back to
   roster" link.
2. **Compliance summary panel**: fetches `/clients/{id}/compliance` for a
   7-day window. If `plan` is null, renders "No active plan assigned" with
   a link to assign one (reuses the existing `AssignModal`). Otherwise
   shows the plan's title/dates and the percent as a KPI tile, matching the
   client-portal Dashboard's `.nutrio-kpi` tile styling for visual
   consistency between the two apps (an existing project convention).
3. **Recent log history**: fetches `/clients/{id}/logs`, grouped by date,
   rendered with the same eaten/substituted/skipped visual treatment and
   substitution-note display already built in the client portal's own
   `LogTab.tsx` "Recent history" section — extract the shared grouping/row
   logic into a common component both screens import, rather than
   duplicating it a second time (this is the plan's one deliberate
   refactor: `LogTab.tsx`'s history-rendering already exists once; a
   second, near-identical copy here is exactly the "three similar lines"
   case that should become one shared component instead).
4. **Recent measurements**: fetches `/clients/{id}/measurements`, same
   list-with-deltas treatment as `MeasurementsTab.tsx`, same refactor
   rationale — extract the shared row-rendering into a common component.
5. Both history sections' "load more" reuses the exact widening-date-range
   pattern (`HISTORY_PAGE_DAYS`, `HISTORY_MAX_DAYS`, the small text-link
   button style) already established in `LogTab.tsx`/`MeasurementsTab.tsx`.

### Dashboard wiring (`Dashboard.tsx`)

- New `@wordpress/data` store selector for `/dashboard/overview`, following
  the same pattern as the existing `clientCount`/`recipeCount`
  `useSelect()` calls (`Dashboard.tsx:63-77`).
- Replace the hardcoded `"8/12"` "Logged today" KPI with
  `${logged_today_count}/${active_client_count - clients_without_plan_count}`.
- Replace the hardcoded `"3"` "Plans awaiting review" KPI with the real
  `draft_plan_count`.
- Replace `PLACEHOLDER_COMPLIANCE` (lines 21-50) with the real `compliance`
  array — each row links to that client's new detail screen
  (`?view=clients&id={client_id}`).
- Add a small line/badge showing `clients_without_plan_count` ("N clients
  have no active plan") near the compliance panel, since those clients are
  deliberately excluded from the percentage list.
- Loading state uses the existing `Skeleton` component
  (`src/components/ui/Skeleton.tsx`) — already built generic/reusable for
  exactly this kind of use.

## Testing

1. **Compliance calculation** — unit tests against `ClientsController`'s
   compliance handler (or its extracted helper): a plan fully logged
   (100%), partially logged, zero logged, a plan whose date range only
   partially overlaps the requested window (clamping), a client with no
   active plan (`plan: null`), and a plan item logged more than once (still
   counts once).
2. **Ownership** — a practitioner cannot fetch another practitioner's
   client's logs/measurements/compliance via these new routes (same
   `assert_owns()` 404-not-403 pattern as every other owned resource).
3. **Dashboard overview** — a practitioner with a mixed roster (some active
   clients with plans, some without, some draft plans) gets the correct
   counts; empty-roster case (all zeros, empty `compliance` array) renders
   without error.
4. **Frontend** — the extracted shared log-history and measurement-history
   components render identically in both their original location
   (`LogTab.tsx`/`MeasurementsTab.tsx`) and the new `ClientDetail.tsx`,
   confirmed by not changing the client-portal's own existing behavior
   (regression check) while the new screen renders correctly with live
   data via the built-in browser.
