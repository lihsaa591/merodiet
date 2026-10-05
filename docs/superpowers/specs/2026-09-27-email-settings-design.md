# Email Settings — Design Spec

## Context

MeroDiet currently sends exactly two emails, both client-facing, both unbranded
WordPress-core copy routed through `retrieve_password()`/`retrieve_password_message`:
the initial client invite (`ClientInviteService`) and the genuine
forgot-password flow (`PortalPage`). No practitioner-facing email exists at
all. This was flagged as a known gap in `JOURNEY.md`: *"Not yet built — email
settings with dynamic tags and a builder."*

This spec adds a Settings section letting practitioners customize five
transactional emails (subject + body, with merge tags via a simple
insert-tag builder, not raw HTML), across two audiences — split into a
Practitioner tab and a Client tab in the existing `Settings.tsx` screen,
which today has only a General tab (USDA API key). A third, "Email styles"
entry sits alongside as a Pro-locked placeholder — no editor is built for it;
it opens the same `ProUpsellModal` the sidebar's "Analytics" entry already
uses.

## The five email types

| Type key | Audience | Trigger | New or existing? |
|---|---|---|---|
| `client_invite` | Client | `ClientInviteService` invites a client | Existing (currently unbranded) |
| `client_password_reset` | Client | Client uses "Forgot your password?" | Existing (currently unbranded) |
| `client_plan_assigned` | Client | A plan is assigned to them | New |
| `practitioner_client_added` | Practitioner | They add a new client | New |
| `practitioner_daily_digest` | Practitioner | Scheduled, at a configurable time | New |

Each type ships a hardcoded default subject/body baked into code, so the
feature works with zero configuration on a fresh install — a saved override
is optional, not required.

## Storage — one option per email type

**Decision: per-type options (`merodiet_email_{type}`, e.g.
`merodiet_email_client_invite`), each `autoload = false`** — not a single
option holding all five as one array.

This mirrors WooCommerce's approach (`woocommerce_{email_id}_settings`,
one option per email type) rather than a single shared blob, specifically
for future scalability: MeroDiet's own boilerplate plan includes an add-on
loader (`addons/*`) as a planned extensibility point. If a future add-on
ever registers its own email type, per-type options mean it can
`add_option()` its own row without any core code change and without a
write-race against an unrelated save touching a shared array. The
implementation cost of per-type vs. single-option is effectively identical
(a keyed option name vs. a keyed array entry), so there's no YAGNI argument
for the simpler-looking single option — per-type is the same effort and
ages better.

`EmailTemplateService`'s public API is still type-keyed (`get($type)` /
`save($type, $subject, $body)`), so callers never know or care how storage
is split — this is purely internal to that one class.

`autoload = false` on every one of these options: they're only ever read
when rendering the Settings screen or actually sending an email, never on
an arbitrary front-end page load, so there's no reason for WordPress to
load them into memory on every request.

## New classes

**`includes/Email/EmailTemplateRegistry.php`** — the fixed list of 5 types.
For each: default subject, default body, and the allowed merge tags (an
array of `{tag_name: description}` — the description is what the builder's
"insert tag" button shows as a tooltip). A method
`is_known_type(string $type): bool` and `get_default(string $type): array{subject:string, body:string}`.

Tag reference per type:
- `client_invite`: `{{client_first_name}}`, `{{client_last_name}}`, `{{practitioner_name}}`, `{{portal_url}}`, `{{site_name}}`
- `client_password_reset`: `{{client_first_name}}`, `{{reset_url}}`, `{{site_name}}`
- `client_plan_assigned`: `{{client_first_name}}`, `{{plan_title}}`, `{{start_date}}`, `{{end_date}}`, `{{portal_url}}`
- `practitioner_client_added`: `{{practitioner_name}}`, `{{client_first_name}}`, `{{client_last_name}}`, `{{invite_status}}` (a human string: "invited" or "invite failed: …")
- `practitioner_daily_digest`: `{{practitioner_name}}`, `{{report_date}}`, `{{report_table}}` (pre-rendered HTML block — see below)

**`includes/Email/EmailTemplateService.php`** — `get(string $type): array{subject, body}`
(saved override merged over the registry default), `save(string $type, string $subject, string $body): void`
(validates `$type` via the registry, `sanitize_text_field()`s the subject,
`wp_kses_post()`s the body, writes the option), and
`render(string $type, array $context): array{subject, body}` — does the
`{{tag}}` substitution (a plain `strtr()` over the context map; any tag in
the body not present in `$context` is left as literal text rather than
silently blanked, so a typo'd tag is visible and debuggable rather than
disappearing).

**`includes/Email/Mailer.php`** — `send(string $type, string $to, array $context): bool`.
Calls `EmailTemplateService::render()`, wraps the resulting body in one
shared HTML skeleton (site logo via the same `get_theme_mod( 'custom_logo' )`
fallback-to-site-icon logic `PortalPage::render_site_logo()` already has,
plus the `--sage` accent color from `tokens.css` for the header band), sets
`Content-Type: text/html`, calls `wp_mail()`. This shared skeleton is
exactly the piece a future "Email styles" Pro feature would let someone
replace — it's intentionally not exposed as configurable today.

## Wiring the triggers

1. **`client_invite`** — `ClientInviteService::invite()` currently calls
   `retrieve_password( $user->user_login )` directly. Add a short-lived
   static flag (`ClientInviteService::$sending_invite = true` set
   immediately before that call, reset to `false` immediately after) that
   `PortalPage::customize_reset_password_email()` checks first: if set, it
   builds the `client_invite` render context (client + practitioner names,
   portal URL) and returns `Mailer::send()`'s body instead of falling
   through to its current generic reset-email copy. This is the minimal
   change that lets one shared WP core code path (`retrieve_password()`)
   produce two different branded emails depending on which of our own
   call sites triggered it — no change to core's own behavior for a
   practitioner or admin's own password reset (that path never sets the
   flag, and the filter's existing `has_cap( 'view_own_merodiet_plan' )`
   guard already excludes non-clients entirely).
2. **`client_password_reset`** — the same filter, when the flag is *not*
   set (the genuine "Forgot your password?" path) — same as today, just
   now rendered through `Mailer` with the `client_password_reset` type
   instead of the current inline `sprintf()`.
3. **`client_plan_assigned`** — new. One `Mailer::send()` call added
   immediately after `$this->plans->assign( $id, $client_id, $snapshot );`
   succeeds in `PlansController.php:329`, using the client's email
   (`ClientRepository::find()`) and the plan's title/dates.
4. **`practitioner_client_added`** — new. Added in
   `ClientsController::create_client()`, after the existing
   `send_invite`/`invite_error` handling, sent to
   `wp_get_current_user()->user_email` (the practitioner who's logged in
   creating the client).
5. **`practitioner_daily_digest`** — new, see below.

## The daily digest

**Scope (confirmed): scheduled digest only** — one email per day per
practitioner, at a single site-wide configurable time, never an instant
per-client-completion email. Multi-practitioner clinics are an explicit
v1 non-goal, so "site-wide" (not "per-practitioner") time is an accepted
simplification, called out here so it isn't accidentally treated as an
oversight later.

**Storage:** two more small, non-autoloaded options —
`merodiet_digest_enabled` (bool, default `false` — opt-in, not sent until a
practitioner turns it on) and `merodiet_digest_time` (string `HH:MM`,
default `'20:00'`).

**`includes/Email/DigestScheduler.php`** — `reschedule(): void`, called
whenever `merodiet_digest_time` or `merodiet_digest_enabled` is saved (from
the new `PUT /settings/email-digest` route) and once from
`Activation::activate()`. Clears any existing `merodiet_daily_digest` cron
hook (`wp_clear_scheduled_hook`), and if enabled, computes the next
occurrence of the configured time (today if it hasn't passed yet in the
site's timezone, else tomorrow) and calls
`wp_schedule_event( $timestamp, 'daily', 'merodiet_daily_digest' )`.
`Deactivation::deactivate()` gets one added line,
`wp_clear_scheduled_hook( 'merodiet_daily_digest' )` — its own docblock
already anticipated exactly this ("clear scheduled events").

**`includes/Email/DigestMailer.php`** — hooked to `merodiet_daily_digest`.
For every user with the `manage_merodiet_clients` capability (i.e. every
practitioner): fetch their clients via `ClientRepository::all_for_practitioner()`
— an existing paginated method (`page`/`per_page`/`filters`), so this
loops pages until a short page confirms there are no more, rather than a
single all-in-one call (no dedicated "all clients, unpaginated" method
exists today, and adding one only for this internal loop isn't worth a
new public repository method for what's already a rare, size-bounded
per-practitioner list). For each client check whether they logged
anything today (the same independent `LogEntryRepository` check
`DashboardController` already added for its `logged_today_count`, not
`ComplianceCalculator`, since a digest should report ad-hoc entries too,
same reasoning as that earlier fix). Builds an HTML `<table>` (name +
"Logged today" / "No activity") as the `{{report_table}}` tag's value,
and calls `Mailer::send( 'practitioner_daily_digest', ... )` — skipped
entirely for a practitioner with zero clients (no empty digest noise).

## New capability

`manage_merodiet_settings` added to `RoleRegistrar::PRACTITIONER_CAPS`. This
already gets synced to the `practitioner` role and to `administrator` for
existing installs automatically — `DatabaseServiceProvider` calls
`RoleRegistrar::register()` as part of its own migration catch-up, so no
separate upgrade routine is needed. The existing `/settings/usda-key`
routes stay on `manage_merodiet_foods` (out of scope — not touching working
code for this feature), but every new route below uses
`manage_merodiet_settings`.

## REST API (new routes on the existing `SettingsController`)

- `GET /settings/email-templates` — for every known type: its effective
  (saved-or-default) subject/body, its allowed tags, and its audience
  (`practitioner`/`client`) — enough for the UI to render both tabs from
  one call.
- `PUT /settings/email-templates/{type}` — body `{subject, body}`. Returns
  `$this->error( 'unknown_email_type', ..., 404 )` (the existing
  `AbstractController::error()` helper) for an unknown `$type` rather
  than silently creating a new option key.
- `GET /settings/email-digest` / `PUT /settings/email-digest` — body
  `{enabled, send_time}`; the `PUT` handler validates `send_time` matches
  `H:i` format, saves both options, then calls
  `DigestScheduler::reschedule()`.

## Admin UI

`Settings.tsx` gains a tab strip (reusing the same pill-tab pattern
`ClientDetail.tsx` already introduced): **General** (today's USDA key,
unchanged) / **Practitioner** / **Client**.

Each of the two new tabs lists its email types as `Panel` sections
(matching the existing USDA key section's look): a subject `<input>`, a
body `<textarea>`, and a row of small buttons below it — one per allowed
tag — that insert `{{tag}}` at the textarea's current cursor position on
click (a plain `textarea.setRangeText()` call, no rich-text editor
needed). The Practitioner tab's `practitioner_daily_digest` section also
gets an enabled toggle and a `<input type="time">` for the send time.

An "Email styles" row sits at the bottom of both tabs' section list (or
as its own small panel), showing a lock icon and opening
`ProUpsellModal` with `featureName="Custom email styling"` on click —
copy-pasting the exact pattern `Sidebar.tsx`'s "Analytics" entry already
uses. No new component needed.

## Testing

- `EmailTemplateServiceTest` — default fallback when nothing's saved,
  save-then-get round-trip, unknown-type rejection, tag substitution
  (including the "unknown tag stays literal" behavior).
- `MailerTest` — renders + wraps + calls `wp_mail()` with the right
  arguments (mocked).
- `DigestSchedulerTest` — reschedule computes today-vs-tomorrow correctly
  around the boundary, clears the old hook before scheduling a new one,
  does nothing destructive when disabled (just clears).
- `DigestMailerTest` — skips a practitioner with no clients, correctly
  splits clients into logged/not-logged for the report table.
- Controller tests for the three new/changed `SettingsController` routes,
  following `ClientsControllerCreateTest`'s established pattern for
  constructing real `final` service classes with mocked repository
  dependencies underneath.
- `ClientInviteServiceTest` gets one more case: the flag is set during
  `invite()` and reset afterward even if `retrieve_password()` itself
  errors (a `try/finally`, not a bare set-call-unset, so a WP_Error
  return doesn't leave the flag stuck true for the next unrelated
  request in the same PHP process — relevant for a long-running
  `wp-cli`/cron context more than a normal request, but cheap to get
  right).

## Non-goals (this feature)

- No raw HTML/CSS editor ("Email styles") — locked, unbuilt, matches the
  existing Analytics lock pattern exactly.
- No per-practitioner digest send time — one site-wide time (see Digest
  section above).
- No instant per-client "finished their plan" email — digest only, per
  the confirmed decision.
- No email log/history/resend UI — sending is fire-and-forget via
  `wp_mail()`, same as the existing invite/reset flows today.
