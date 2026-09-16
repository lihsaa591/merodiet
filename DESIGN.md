# DESIGN.md — Nutrio Admin Dashboard

**Status: LOCKED** — confirmed with the user across iterative review.

## Identity

Nutrio is a practice-management tool for registered dietitians/nutritionists — client roster, USDA-backed recipe/nutrient data, meal-plan building. The visual identity is calm and clinical without being cold: a muted indigo/periwinkle accent with a matching pale lavender wash against a neutral white/gray base, flat bordered surfaces (no drop shadows), one quiet sans-serif typeface throughout.

**Pins (do not re-litigate without explicit user request):**
- Accent hue: muted indigo/periwinkle (`--sage`) — deliberately kept out of the green/teal family to avoid any resemblance to AllCoach's (a sibling product) brand identity, which would read as a conflict of interest; landed here after trying several directions (terracotta, olive/khaki, zesty orange, steel-blue, muted mauve) and finding this one calmest and most distinct
- Type: single humanist sans family (no separate display serif) — chosen specifically to avoid a "trying too hard" feel
- Surfaces: flat, bordered, no box-shadow except on genuinely floating elements (modals, dropdowns)
- Type: single humanist sans family (no separate display serif) — chosen specifically to avoid a "trying too hard" feel
- Surfaces: flat, bordered, no box-shadow except on genuinely floating elements (modals, dropdowns)

## Color tokens

| Token | Light | Dark | Role |
|---|---|---|---|
| `--paper` | `#FAFAFA` | `#1C1A20` | page background |
| `--paper-dim` | `#F1F1F2` | `#151318` | sidebar / recessed background |
| `--surface` | `#FFFFFF` | `#242229` | card/panel background |
| `--surface-raised` | `#FFFFFF` | `#2B2831` | drawer/modal background |
| `--ink` | `#26262A` | `#E9E6EF` | primary text |
| `--ink-muted` | `#6D6D74` | `#A39DAF` | secondary text |
| `--ink-faint` | `#9D9DA3` | `#716B7D` | tertiary/placeholder text |
| `--line` | `#E7E6EA` | `#34303B` | default border |
| `--line-strong` | `#D5D3DA` | `#423D4A` | emphasized border (inputs, active states) |
| `--sage` (accent) | `#5B5FA6` | `#5B5FA6` | primary accent — buttons, active nav, links |
| `--sage-deep` | `#454880` | `#7579C4` | accent hover/pressed |
| `--sage-wash` | `#E6E6F5` | `#23233D` | accent-tinted background (active nav, chips) |
| `--clay` (neutral secondary) | `#8B8B90` | `#8D889B` | neutral secondary accent, avatars/badges without semantic meaning |
| `--success` / `-wash` | `#4C9179` / `#E5F2ED` | `#7FC1A8` / `#1F332B` | positive semantic state |
| `--warning` / `-wash` | `#B08A3C` / `#F6EFDF` | `#D8B268` / `#362C18` | caution semantic state |
| `--critical` / `-wash` | `#C1554D` / `#FBECEA` | `#E29089` / `#3A2422` | safety-relevant semantic state (e.g. allergy flags — must never be muted) |

All pairs verified to hold WCAG AA text contrast in both themes (body ≥4.5:1, large text ≥3:1).

Theme is switched via `data-theme="light"|"dark"` on the root element (explicit toggle in the sidebar), falling back to `prefers-color-scheme` when no explicit choice has been made yet.

**Known cascade gotcha (fixed, keep in mind):** never rely on inheritance alone for heading color. wp-admin's own core CSS has a direct (theme-unaware) rule for `h1`, and a direct rule always beats plain inheritance regardless of specificity — this caused invisible page titles in dark mode until `.nutrio-admin-app h1/h2/h3/h4` was given an explicit `color: var(--ink)`.

## Typography

Single family: **Public Sans** (400/500/600/700/800), plus **IBM Plex Mono** for tabular numeric data (nutrient amounts, kcal, dates). No separate display serif — headings use Public Sans at 700 weight, distinguished by size/spacing rather than a different typeface.

## Client-identity component — SUPERSEDED, reverted

A design-review pass flagged the two-letter colored-circle avatar (sidebar, dashboard, clients table, plans table) as a generic "AI dashboard" tell, and proposed a colored left-border-strip alternative instead. **The user explicitly preferred the original circle avatar and asked to keep it.** Decision: the circle avatar stays. This is a deliberate, user-confirmed exception to that review finding — do not re-propose the strip alternative without being asked.

## Dashboard opener — SUPERSEDED, reverted

Same review pass flagged the 4-equal-tile KPI row as the generic "AI SaaS dashboard" shape and proposed an asymmetric hero-stat + secondary-list layout. **The user explicitly preferred the original 4-tile KPI row and asked to keep it.** Decision: the 4-tile row stays. Do not re-propose the hero-stat layout without being asked.

## Shape system

A prior review found the mockup used one border-radius family uniformly on every surface, contributing to a generic feel. Current system:
- **Structural containers** (panels, tables, cards): `10px` radius, `1px` border, no shadow.
- **Interactive controls** (buttons, inputs, nav items): `8px` radius.
- **Status communication** (see below): a single consistent pill/chip shape, not mixed with structural containers.

## Status communication

One system only, used everywhere a status is shown (client active/paused, plan draft/assigned, food source):
- A small rounded pill (`Chip` component, tones: `sage` / `clay` / `success` / `warning` / `critical`), background = semantic-wash, text = semantic-deep/solid color.
- A plain colored dot is reserved ONLY for the allergy-safety indicator in the plan builder (a single, deliberately distinct treatment for the one safety-critical state — never reused for routine status).

## Icon system

Outline stroke icons (`stroke-width: 1.8-2`), but with one deliberate exception: the Pro-feature lock icon uses a **filled** treatment, not outline — so "this costs money" reads as visually distinct from ordinary navigation at a glance, not just via a smaller badge.

## Responsive behavior

Two breakpoints:
- **≤900px**: the fixed sidebar becomes an off-canvas drawer (slides in from the left, dismissible via a scrim or by selecting a nav item), opened by a hamburger button that appears in its place. The sidebar gets extra top padding so its own content (starting with "Back to WordPress") clears the fixed hamburger button rather than rendering underneath it. The KPI row drops to 2 columns; the Recipe builder's and Plan Builder's two-column layouts stack to one column.
- **≤560px**: KPI row and the dashboard's compliance/activity panels drop to a single column; the Add-client drawer becomes full-width; two-column form rows (e.g. first/last name) stack; tables shrink their font slightly (they already scroll horizontally, so no data is ever clipped).

This covers the admin surfaces. The future client-portal frontend (Phase 3, not yet built — clients log meals, view their plan) must get the same responsive treatment from the start, since clients are far more likely than practitioners to be on a phone.

## Full-screen takeover — implementation note

The app hides the standard wp-admin chrome (`#wpadminbar`, `#adminmenumain`, `#wpfooter`, notices) via CSS scoped to `body.toplevel_page_nutrio`, and the app root becomes `position: fixed; inset: 0` to cover the full viewport. This was decided early in the design process but not actually wired up until later — noting it here so the gap doesn't reappear if the shell is ever rebuilt.

## NUTRIO_DEVELOPMENT constant

Defined in `nutrio.php`, defaulting to `WP_DEBUG`'s value but independently overridable in `wp-config.php`. Used in `Assets::enqueue_style()` to bust the CSS cache on every load during development (`wp-scripts start` rewrites the built CSS file in place without changing `NUTRIO_VERSION`, so the browser would otherwise keep serving a stale cached copy across saves) — production keeps the stable `NUTRIO_VERSION` string. Also localized to JS as `nutrioAdmin.isDevelopment` to gate the dev-only auto-reload watcher (see DEVELOPMENT.md).

## CSS architecture

Two global stylesheets (`src/styles/tokens.css` for the color tokens above, `src/styles/base.css` for shell/layout/page-level patterns like the KPI row, table, and form fields that are used directly by screens rather than through a shared component), plus **CSS Modules** for the actual reusable component set (`Button`, `Panel`, `Chip`, `Avatar`, `Drawer`, `IconButton`, `ProUpsellModal`) — each component has a colocated `ComponentName.module.css`, imported as `styles` and referenced as `styles.xxx`. Class names still carry a `nutrio-` prefix in the compiled output (via a custom `localIdentName` in `webpack.config.js`) for readability in devtools, on top of the automatic collision-proof scoping CSS Modules provides. No SCSS, no Tailwind, no external UI framework — see DEVELOPMENT.md for the reasoning.

## Accessibility requirements

- Every icon-only button (`IconButton`, `Drawer`'s close button, the sidebar's exit/theme-toggle buttons) carries an `aria-label` naming its action.
- Heading levels follow real document structure — no heading used purely for bold-text styling.
- Any fixed-width text column (e.g. client name) allows wrapping or truncates with an accessible full-text fallback (`title` attribute), never silently overflows.
- No uppercase micro-caption pattern on data labels (KPI labels, nutrient-tile labels) — normal case, medium weight, muted color, matching the table-header treatment.
