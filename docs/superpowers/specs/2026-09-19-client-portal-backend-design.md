# Phase 3: Client-Portal Backend — Design

## Purpose

Give a client their own portal login, scoped strictly to their own data, and the REST surface a future client UI will consume: today's plan, compliance logging, and measurements. This pass is backend-only (auth, data layer, REST). No client-facing React screens yet.

## Scalability note

Per explicit instruction, this is built as a reusable pattern, not a one-off:

- `AbstractClientController` (new) is the client-scoped counterpart to the existing `AbstractPractitionerController` — any future client-facing resource (e.g. a Phase 5 AI log-parsing endpoint) extends it rather than re-deriving "resolve the caller's own client_id" logic per controller.
- `LogEntryRepository`/`MeasurementRepository` follow the exact structural pattern of the four existing repositories (`ClientRepository` et al.): a `*_for_client()` scoping method mirrors `*_for_practitioner()`, so a developer already familiar with one half of the codebase recognizes the other immediately.
- The invite/auth mechanism (`ClientInviteService`) is a single, isolated class with one public entry point (`invite()`), independent of any specific controller — it can be called from a future bulk-invite action or an onboarding wizard without touching REST-layer code.

## Components

### 1. `ClientInviteService` (`includes/Clients/ClientInviteService.php`)

- `invite( int $client_id ): true|WP_Error`
  - Loads the client row; 404-equivalent WP_Error if missing.
  - If `user_id` is already set, skips user creation and just resends the reset-password email (idempotent re-invite).
  - Else: creates a WP user via `wp_insert_user()` with role `nutrition_client`, `user_login` derived from the email (sanitized, uniqued with a numeric suffix on collision), `user_email` = client's email, a random unusable password (client never uses it directly — they set their own via the reset link).
  - Calls `retrieve_password( $user->user_login )` (WordPress core) to send the "set your password" email via the standard `wp-login.php?action=rp` flow — no custom token storage, reusing a mechanism WordPress core already secures and maintains.
  - Persists the new `user_id` onto the client row via `ClientRepository::set_user_id()`.
  - Fires `do_action( 'nutrio_client_invited', $client_id, $user_id )` for symmetry with the existing `nutrio_client_created` hook.

### 2. `AbstractClientController` (`includes/RestApi/AbstractClientController.php`)

- Extends `AbstractController`. Namespace `nutrio/v1`.
- `current_client_id(): int|WP_Error` — looks up `nutrio_clients` row where `user_id = get_current_user_id()`; returns its `id`, or a `nutrio_not_found` WP_Error (404) if the logged-in user has no linked client row (defends against a `nutrition_client`-role user somehow existing without a client record).
- Routes register with capability `view_own_nutrio_plan` (passed as `$required_capability` to `register_route()`, matching the existing pattern).
- No `assert_owns()` equivalent is needed at the repository-return level because every repository method here takes the resolved `client_id` from `current_client_id()` directly — the client never supplies a client_id in the request, so there's nothing to spoof.

### 3. `LogEntryRepository` (`includes/Repositories/LogEntryRepository.php`)

- `create_for_client( int $client_id, array $data ): int` — inserts one entry (`plan_item_id`, `food_id`, `recipe_id`, `quantity_grams`, `servings`, `log_date`, `status`, `source`, `notes`), `source` defaults `'manual'`.
- `all_for_client( int $client_id, array $filters = [] ): array` — optional `from`/`to` date-range filters via `QueryFilters`, ordered by `log_date DESC, id DESC`.
- `find( int $id ): ?array` — single row, used by a future edit/delete pass; returns the row including `client_id` so a caller can verify ownership (mirrors `ClientRepository::find()`'s existing shape).

### 4. `MeasurementRepository` (`includes/Repositories/MeasurementRepository.php`)

- `create_for_client( int $client_id, array $data ): int` — `measured_at`, `weight_grams`, `metrics` (JSON-encoded), `notes`.
- `all_for_client( int $client_id, array $filters = [] ): array` — optional date range, ordered by `measured_at DESC`.
- `find( int $id ): ?array`.

### 5. `ClientRepository` addition

- `set_user_id( int $client_id, int $user_id ): void` — the one new write method needed for the invite flow.

### 6. REST endpoints

**On `ClientsController`** (existing, practitioner-side):
- `POST /clients/{id}/invite` — capability `manage_nutrio_clients`, `assert_owns()` first, then delegates to `ClientInviteService::invite()`.

**New `MeController` (`includes/RestApi/MeController.php`)**, `rest_base = 'me'`, extends `AbstractClientController`:
- `GET /me/plan` — today's assigned plan for this client (delegates to `PlanRepository`; needs a small `find_active_for_client( int $client_id, string $date )` addition there — the existing plan-fetch methods are practitioner-scoped only).
- `GET /me/logs` — list, `from`/`to` query args.
- `POST /me/logs` — create; body validated against `LogEntryRepository`'s fields; `client_id` is never read from the request.
- `GET /me/measurements` — list.
- `POST /me/measurements` — create.

## Data flow

Client logs in (WP core auth, role `nutrition_client`) → every `/me/*` request resolves `current_client_id()` once → repository calls scoped to that ID → response. The invite is a one-time practitioner-initiated action that provisions the WP user; after that, login is indistinguishable from any other WP user (wp-login.php, application passwords, etc. all keep working — nothing bespoke).

## Error handling

- Missing client row for a logged-in `nutrition_client` user → 404 `nutrio_not_found` (same "don't leak existence" posture as `assert_owns()`).
- Invite on a client that already has a linked user → not an error, resends reset email (see idempotency above).
- Invite on a client whose email collides with an existing WP user's email → `WP_Error` surfaced as 409 `nutrio_email_in_use`; practitioner must resolve manually (out of scope to auto-link).

## Testing

- `LogEntryRepositoryTest`, `MeasurementRepositoryTest`: CRUD + client-scoping (two clients' rows never cross).
- `ClientInviteServiceTest`: first invite creates a user + sets user_id; second invite on same client doesn't create a duplicate user; email-collision path returns the expected error.
- `MeControllerTest`: a client token can fetch only their own plan/logs/measurements; a request that tries to smuggle a different `client_id` in the POST body is ignored (server always uses the resolved one).

## Non-goals (this pass)

- Client-facing React UI (follow-up pass).
- Editing/deleting existing log entries or measurements (create + list only; matches "log what happened" v1 scope from the product plan).
- Self-service registration — invites are always practitioner-initiated.
