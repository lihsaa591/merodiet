# DEVELOPMENT.md — Nutrio

Practical developer setup and workflow. For the visual design system, see `DESIGN.md`. For the product/page specs, see `JOURNEY.md`.

## Setup

```bash
composer install   # PHP dependencies (league/container, dev tooling)
npm install         # JS dependencies (@wordpress/* packages, TypeScript)
```

To test against a real WordPress site (e.g. a Local by Flywheel install), symlink this repo into the site's plugins directory:

```bash
ln -s /path/to/nutrio "/path/to/site/app/public/wp-content/plugins/nutrio"
```

Then activate it from wp-admin → Plugins. Activation runs the database migrations and registers the `practitioner`/`nutrition_client` roles.

**Give a test user the `practitioner` role** (not just Administrator) to exercise the real capability gating — Administrators get the plugin's capabilities too (see `RoleRegistrar`), but testing only as an admin would hide a regression like the one this project already had once (every REST route silently defaulting to `manage_options`).

## Build modes

| Command | Mode | Output |
|---|---|---|
| `npm run start` | development | Unminified, source maps, rebuilds on save. Leave it running while you work. |
| `npm run build` | production | Minified. Run this before committing or testing "real" behavior. |

**wp-scripts' `--hot` flag does not help here** — it only enables Hot Module Replacement inside the Gutenberg block editor context, not a plain custom admin page like this one. Instead, `npm run start` + a dev-only auto-reload watcher (in `src/admin/index.tsx`, gated by `window.nutrioAdmin.isDevelopment`) polls the built JS file's `Last-Modified` header and reloads the tab automatically when it changes — a full-page reload, not true state-preserving HMR, but it removes the "manually hit refresh after every save" friction without any new dependency or a second dev-server process to manage. See `DESIGN.md`'s `NUTRIO_DEVELOPMENT` section for the PHP side of this.

If you ever leave a `npm run start` watch process running in the background and forget about it, kill it before running `npm run build` — a stray watcher can keep rewriting `build/` files and confuse the auto-reload watcher into a reload loop.

## Quality gates

```bash
composer run test      # PHPUnit
composer run phpcs      # WordPress Coding Standards
composer run phpstan    # Static analysis
npx tsc --noEmit         # TypeScript type-checking (no build step)
```

Run all of these before considering a change done. All are already CI-checked (`.github/workflows/ci.yml`).

## Git workflow

- **`development`** is the base branch for all work. Branch features off it, open PRs back into it.
- **`main`** only receives code via an explicit `development` → `main` PR, once something is verified ready. It started as an empty placeholder, not a copy of `development`'s in-progress state.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` when generated with Claude Code's help.

## Architecture decisions (and why)

These were deliberated and settled — don't relitigate without a real reason:

- **No external UI framework** (no MUI/Ant/Chakra/Radix). Every screen's visual identity is already fully specified in `DESIGN.md`; a component library would mean fighting its own defaults more than writing our own small, prop-driven components (`src/components/ui/`).
- **No Tailwind.** Needs its own PostCSS build-step integration on top of `wp-scripts`, and doesn't map cleanly onto a token-driven design system that's already fully defined as CSS custom properties.
- **No SCSS.** Every "variable" need is already covered by CSS custom properties; SCSS would add a new dependency and a webpack loader we'd have to maintain, for nesting/mixins we don't currently need. Modern CSS nesting is available natively with zero tooling if that ever changes.
- **CSS Modules for the reusable component set**, not global class names. `wp-scripts`'s `css-loader` already ships with `modules: { auto: true }` — any `*.module.css` file gets automatic, collision-proof scoped class names for free, no new dependency. `webpack.config.js` customizes the generated name pattern (`nutrio-[name]__[local]`) so scoped classes still read clearly in devtools. Page-level styles used directly by a screen (not through a shared component) stay in the two global stylesheets (`tokens.css`, `base.css`).
- **No router library.** Page switching is plain React state, synced to the URL via native `history.pushState`/`popstate` — enough for a handful of top-level views, no dependency needed.
- **`@wordpress/data` store actions must be thunks, not generators.** A real bug: this version of `@wordpress/data` does not auto-dispatch a plain action object yielded from a generator action — it silently drops the mutation. Every store action returns `(data) => async ({ dispatch }) => {...}` instead. See `src/store/clients/actions.ts` for the pattern to copy for future stores (recipes, plans).
- **TypeScript throughout** (`.ts`/`.tsx`, strict mode). `@types/react`/`@types/react-dom` are dev-only (zero runtime/bundle cost) — confirmed by build output size staying identical after the conversion.
- **`pnpm` was considered and rejected** for this project — it earns its keep in monorepos with many shared packages; here it would just be one more tool contributors need installed separately, for no measurable benefit on a single small plugin.

## Known gotchas

- **`wp_localize_script()` serializes PHP booleans as the string `"1"` or `""`**, never a real JS boolean. Check truthiness (`if (settings.isDevelopment)`), never `=== true`.
- **wp-admin's own core CSS can silently override inherited color** on elements like `h1` if we don't set it explicitly — this caused invisible page titles in dark mode once. Always set color directly on text elements rather than relying on inheritance from a wrapper.
- **GitHub rejects PRs between branches with no shared git history.** If a branch is ever created as a fully orphan branch (`git checkout --orphan`), it needs a common ancestor commit with its counterpart before a PR can be opened — plan for that up front rather than needing a history rewrite later.
