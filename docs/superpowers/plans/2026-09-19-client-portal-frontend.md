# Client-Portal Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the client-facing front-end (outside wp-admin) that lets a `nutrition_client` view their assigned plan, log compliance, and log measurements against the already-built `/me/*` REST endpoints (PR #5).

**Architecture:** A PHP `PortalRewrite` class registers a permalink-structure-agnostic route (`/client-portal/` when pretty permalinks are on, `?nutrio_portal=1` always), a `PortalPage` class handles the request on `template_redirect` (login form / React mount / redirect-away), and a new webpack entry `client-portal` builds a small React app (`App.tsx` + three tab screens) that talks to `/me/*` via `@wordpress/api-fetch`, mirroring the practitioner admin app's existing patterns throughout.

**Tech Stack:** PHP 8.1, WordPress rewrite API, React 18 (`@wordpress/element`), `@wordpress/api-fetch`, `@wordpress/i18n`, `@wordpress/hooks` (new dependency use, already a transitive package), CSS Modules, PHPUnit + Brain Monkey.

**Spec:** `docs/superpowers/specs/2026-09-19-client-portal-frontend-design.md`

## Global Constraints

- PHP 8.1, `declare( strict_types=1 );` at the top of every new/modified PHP file.
- Every user-facing string goes through `__( '...', 'nutrio' )` from `@wordpress/i18n` (JS) or WordPress's own `__()` (PHP) — no hardcoded English strings.
- The portal must be reachable under ANY permalink structure (Plain or pretty) — never assume `get_option( 'permalink_structure' )` is non-empty.
- `PortalPage`/`PortalRewrite` must never accept a client identifier from the URL or query string — the logged-in user's own linked client row (via `ClientRepository::find_for_user()`) is the only source of identity, matching the `/me/*` REST layer's own posture.
- No React Router — single mount, tab state in `App.tsx`, matching the practitioner admin app's existing `App.tsx` pattern.
- No food/recipe search, no edit/delete of past log entries or measurements, no push notifications — all explicitly out of scope per the spec's Non-goals section.
- `composer test` and `npm run check-types` / `npx wp-scripts lint-js` must all stay green after every task.
- Commit style: `feat: ...` subject, trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

### Task 1: `PortalRewrite` — permalink-agnostic routing

**Files:**
- Create: `includes/Clients/PortalRewrite.php`
- Modify: `includes/Activation.php`
- Test: `tests/Unit/Clients/PortalRewriteTest.php`

**Interfaces:**
- Produces: `PortalRewrite::register(): void` (registers the query var + rewrite rule; called both from a provider's `init` hook and directly from `Activation::activate()`), `PortalRewrite::url(): string` (used by `PortalPage` in Task 2 and the login-redirect filter), `PortalRewrite::QUERY_VAR` constant (string `'nutrio_portal'`, used by `PortalPage` to detect the route).

- [ ] **Step 1: Write the failing test**

```php
<?php
/**
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Tests\Unit\Clients;

use Brain\Monkey\Functions;
use Nutrio\Clients\PortalRewrite;
use Nutrio\Tests\TestCase;

final class PortalRewriteTest extends TestCase {

	public function test_url_uses_pretty_path_when_permalinks_are_pretty(): void {
		Functions\when( 'get_option' )->justReturn( '/%postname%/' );
		Functions\when( 'home_url' )->alias( static fn( string $path ) => 'https://example.test' . $path );

		self::assertSame( 'https://example.test/client-portal/', PortalRewrite::url() );
	}

	public function test_url_uses_query_var_when_permalinks_are_plain(): void {
		Functions\when( 'get_option' )->justReturn( '' );
		Functions\when( 'home_url' )->alias( static fn( string $path ) => 'https://example.test' . $path );

		self::assertSame( 'https://example.test/?nutrio_portal=1', PortalRewrite::url() );
	}

	public function test_query_var_constant_matches_the_registered_var(): void {
		self::assertSame( 'nutrio_portal', PortalRewrite::QUERY_VAR );
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `composer test -- --filter PortalRewriteTest`
Expected: FAIL — class `Nutrio\Clients\PortalRewrite` not found.

- [ ] **Step 3: Implement `PortalRewrite`**

```php
<?php
/**
 * Permalink-structure-agnostic routing for the client portal.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Clients;

/**
 * A rewrite rule alone does nothing under WordPress's "Plain" permalink
 * structure — the rewrite engine isn't engaged in that mode at all. To
 * reach the portal under every structure, this class registers a public
 * query var (always active, regardless of permalink structure) AND, as
 * a purely cosmetic layer on top, a pretty rewrite rule for sites that
 * have one. url() builds whichever form matches the current site so
 * every caller (PortalPage's own redirects, a future "view portal" link
 * on the practitioner side) gets a working link without knowing which
 * permalink mode is active.
 */
final class PortalRewrite {

	/**
	 * The query var PortalPage checks on template_redirect to detect
	 * this route, regardless of which permalink structure produced the
	 * request.
	 */
	public const QUERY_VAR = 'nutrio_portal';

	/**
	 * Register the query var and, when relevant, the pretty rewrite
	 * rule. Idempotent and safe to call on every 'init' as well as
	 * directly from Activation::activate() (see that class) — the same
	 * pattern RoleRegistrar::register() already uses.
	 */
	public static function register(): void {
		add_filter(
			'query_vars',
			static function ( array $vars ): array {
				$vars[] = self::QUERY_VAR;
				return $vars;
			}
		);

		add_rewrite_rule(
			'^client-portal/?$',
			'index.php?' . self::QUERY_VAR . '=1',
			'top'
		);
	}

	/**
	 * The portal's URL, in whichever form matches this site's current
	 * permalink structure.
	 */
	public static function url(): string {
		if ( '' !== (string) get_option( 'permalink_structure', '' ) ) {
			return home_url( '/client-portal/' );
		}

		return home_url( '/?' . self::QUERY_VAR . '=1' );
	}
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `composer test -- --filter PortalRewriteTest`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire `PortalRewrite::register()` into `Activation::activate()`**

Read `includes/Activation.php` first — it currently calls `RoleRegistrar::register()` then `flush_rewrite_rules()`. Add the new call between those two, and the import:

```php
use Nutrio\Clients\PortalRewrite;
```

```php
		RoleRegistrar::register();
		PortalRewrite::register();

		flush_rewrite_rules();
```

(The rewrite rule must be registered before the flush, or the flushed rule set won't include it — same reasoning as why `RoleRegistrar::register()` already runs before the flush.)

- [ ] **Step 6: Verify with phpcs, phpstan, and the full suite**

Run: `vendor/bin/phpcs includes/Clients/PortalRewrite.php includes/Activation.php && vendor/bin/phpstan analyse includes/Clients/PortalRewrite.php includes/Activation.php && composer test`
Expected: No errors; full suite green.

- [ ] **Step 7: Commit**

```bash
git add includes/Clients/PortalRewrite.php includes/Activation.php tests/Unit/Clients/PortalRewriteTest.php
git commit -m "$(cat <<'EOF'
feat: add permalink-agnostic routing for the client portal

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `PortalPage` — request handling + PHP-side extensibility hooks

**Files:**
- Create: `includes/Clients/PortalPage.php`
- Create: `includes/Providers/PortalServiceProvider.php`
- Modify: `config/app.php`
- Test: `tests/Unit/Clients/PortalPageTest.php`

**Interfaces:**
- Consumes: `PortalRewrite::QUERY_VAR`, `PortalRewrite::url()` (Task 1), `ClientRepository::find_for_user( int $user_id ): ?array` (already exists), `Assets::enqueue_script()`/`enqueue_style()` (already exists).
- Produces: `PortalPage::handle_request(): void` (hooked to `template_redirect`), `PortalPage::filter_login_redirect( string $redirect_to, string $requested_redirect_to, \WP_User|\WP_Error $user ): string` (hooked to `login_redirect`) — both registered by `PortalServiceProvider`.

- [ ] **Step 1: Write the failing test**

```php
<?php
/**
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Tests\Unit\Clients;

use Brain\Monkey\Functions;
use Nutrio\Clients\PortalPage;
use Nutrio\Repositories\ClientRepository;
use Nutrio\Tests\TestCase;
use WP_User;

final class PortalPageTest extends TestCase {

	public function test_filter_login_redirect_sends_a_client_to_the_portal(): void {
		Functions\when( 'get_option' )->justReturn( '' );
		Functions\when( 'home_url' )->alias( static fn( string $path ) => 'https://example.test' . $path );

		$clients = $this->createMock( ClientRepository::class );
		$page    = new PortalPage( $clients );

		$user = $this->createMock( WP_User::class );
		$user->method( 'has_cap' )->with( 'view_own_nutrio_plan' )->willReturn( true );

		$result = $page->filter_login_redirect( 'https://example.test/wp-admin/', '', $user );

		self::assertSame( 'https://example.test/?nutrio_portal=1', $result );
	}

	public function test_filter_login_redirect_leaves_a_practitioner_untouched(): void {
		$clients = $this->createMock( ClientRepository::class );
		$page    = new PortalPage( $clients );

		$user = $this->createMock( WP_User::class );
		$user->method( 'has_cap' )->with( 'view_own_nutrio_plan' )->willReturn( false );

		$result = $page->filter_login_redirect( 'https://example.test/wp-admin/', '', $user );

		self::assertSame( 'https://example.test/wp-admin/', $result );
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `composer test -- --filter PortalPageTest`
Expected: FAIL — class `Nutrio\Clients\PortalPage` not found.

- [ ] **Step 3: Implement `PortalPage`**

```php
<?php
/**
 * The client portal's front-end request handler.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Clients;

use Nutrio\Helper\Assets;
use Nutrio\Repositories\ClientRepository;
use WP_Error;
use WP_User;

/**
 * A full-page takeover on template_redirect, not a theme template — the
 * same "bare shell + React mount div" approach the wp-admin practitioner
 * page already uses, just reached via the front end instead of
 * wp-admin. This class never accepts a client identifier from the URL
 * or query string: the logged-in user's own linked client row (via
 * ClientRepository::find_for_user()) is the only source of identity,
 * matching the /me/* REST layer's own posture.
 */
final class PortalPage {

	private const MOUNT_ELEMENT_ID = 'nutrio-client-portal-app';
	private const SCRIPT_ENTRY     = 'client-portal';

	/**
	 * @param ClientRepository $clients Used to resolve the logged-in user's own client row.
	 */
	public function __construct( private readonly ClientRepository $clients ) {}

	/**
	 * Hooked to template_redirect. Short-circuits WordPress's normal
	 * template hierarchy whenever the portal's query var is present.
	 */
	public function handle_request(): void {
		if ( ! get_query_var( PortalRewrite::QUERY_VAR ) ) {
			return;
		}

		if ( ! is_user_logged_in() ) {
			$this->render_login_form();
			exit;
		}

		$current_user = wp_get_current_user();

		if ( ! $current_user->has_cap( 'view_own_nutrio_plan' ) ) {
			wp_safe_redirect( admin_url() );
			exit;
		}

		$this->render_app( $current_user );
		exit;
	}

	/**
	 * Sends a just-logged-in client straight to the portal instead of
	 * wp-admin's default redirect. Hooked to login_redirect. Any other
	 * role's redirect is left untouched.
	 *
	 * @param string           $redirect_to           The default redirect destination URL.
	 * @param string           $requested_redirect_to  The requested redirect destination URL, unused here.
	 * @param WP_User|WP_Error $user                   The logged-in user, or a WP_Error on a failed login.
	 */
	public function filter_login_redirect( string $redirect_to, string $requested_redirect_to, WP_User|WP_Error $user ): string { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.FoundAfterLastUsed -- required by the login_redirect filter's signature.
		if ( $user instanceof WP_Error ) {
			return $redirect_to;
		}

		if ( ! $user->has_cap( 'view_own_nutrio_plan' ) ) {
			return $redirect_to;
		}

		return PortalRewrite::url();
	}

	/**
	 * A minimal branded login form for a logged-out visitor. WordPress's
	 * own wp_login_form() handles the POST via wp-login.php — no custom
	 * auth code here.
	 */
	private function render_login_form(): void {
		?>
		<!DOCTYPE html>
		<html <?php language_attributes(); ?>>
		<head>
			<meta charset="<?php bloginfo( 'charset' ); ?>" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<title><?php echo esc_html( get_bloginfo( 'name' ) ); ?> — <?php esc_html_e( 'Client Portal', 'nutrio' ); ?></title>
		</head>
		<body class="nutrio-portal-login">
			<main class="nutrio-portal-login-card">
				<h1><?php esc_html_e( 'Client Portal', 'nutrio' ); ?></h1>
				<?php
				wp_login_form(
					array(
						'redirect' => PortalRewrite::url(),
					)
				);
				?>
			</main>
		</body>
		</html>
		<?php
	}

	/**
	 * The bare HTML shell + React mount div for a logged-in client.
	 *
	 * @param WP_User $current_user The logged-in client's WP user.
	 */
	private function render_app( WP_User $current_user ): void {
		$this->enqueue_assets( $current_user );

		// Lets an add-on enqueue its own script on this exact page load.
		do_action( 'nutrio_client_portal_render', $current_user );
		?>
		<!DOCTYPE html>
		<html <?php language_attributes(); ?>>
		<head>
			<meta charset="<?php bloginfo( 'charset' ); ?>" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<title><?php echo esc_html( get_bloginfo( 'name' ) ); ?> — <?php esc_html_e( 'Client Portal', 'nutrio' ); ?></title>
			<?php wp_head(); ?>
		</head>
		<body>
			<div id="<?php echo esc_attr( self::MOUNT_ELEMENT_ID ); ?>"></div>
			<?php wp_footer(); ?>
		</body>
		</html>
		<?php
	}

	/**
	 * Enqueues the client-portal build and localizes its bootstrap data.
	 *
	 * @param WP_User $current_user The logged-in client's WP user.
	 */
	private function enqueue_assets( WP_User $current_user ): void {
		$handle         = 'nutrio-' . self::SCRIPT_ENTRY;
		$runtime_handle = $handle . '-runtime';

		if ( NUTRIO_DEVELOPMENT ) {
			Assets::enqueue_script( $runtime_handle, NUTRIO_PATH . 'build', NUTRIO_URL . 'build', 'runtime' );
		}

		Assets::enqueue_script(
			$handle,
			NUTRIO_PATH . 'build',
			NUTRIO_URL . 'build',
			self::SCRIPT_ENTRY,
			NUTRIO_DEVELOPMENT ? array( $runtime_handle ) : array()
		);
		Assets::enqueue_style( $handle, NUTRIO_PATH . 'build', NUTRIO_URL . 'build', self::SCRIPT_ENTRY );

		$bootstrap_data = array(
			'restUrl'   => esc_url_raw( rest_url() ),
			'restNonce' => wp_create_nonce( 'wp_rest' ),
			'mountId'   => self::MOUNT_ELEMENT_ID,
			'clientName' => $current_user->display_name,
			'dateFormat' => get_option( 'date_format', 'F j, Y' ),
		);

		/**
		 * Filters the client portal's localized bootstrap data — lets an
		 * add-on inject extra config for its own JS-side section.
		 *
		 * @param array<string, mixed> $bootstrap_data The default bootstrap payload.
		 * @param WP_User              $current_user   The logged-in client's WP user.
		 */
		$bootstrap_data = apply_filters( 'nutrio_client_portal_bootstrap_data', $bootstrap_data, $current_user );

		wp_localize_script( $handle, 'nutrioClientPortal', $bootstrap_data );
	}
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `composer test -- --filter PortalPageTest`
Expected: PASS (2 tests).

- [ ] **Step 5: Create `PortalServiceProvider`**

```php
<?php
/**
 * Client-portal service provider.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Providers;

use League\Container\Container;
use Nutrio\Clients\PortalPage;
use Nutrio\Clients\PortalRewrite;

/**
 * Wires the client portal's rewrite registration, request handling, and
 * login redirect into WordPress — the front-end counterpart to
 * AdminServiceProvider/RestApiServiceProvider.
 */
final class PortalServiceProvider extends AbstractServiceProvider {

	/**
	 * Bind PortalPage with its ClientRepository dependency, mirroring
	 * RestApiServiceProvider's controller-wiring pattern.
	 *
	 * @param Container $container The DI container.
	 */
	public function register( Container $container ): void {
		if ( ! $container->has( \Nutrio\Repositories\ClientRepository::class ) ) {
			$container->add( \Nutrio\Repositories\ClientRepository::class )->setShared( true );
		}

		$container->add( PortalPage::class )
			->setShared( true )
			->addArgument( \Nutrio\Repositories\ClientRepository::class );
	}

	/**
	 * Hook the portal's routing, request handling, and login redirect.
	 *
	 * @param Container $container The DI container.
	 */
	public function boot( Container $container ): void {
		add_action( 'init', array( PortalRewrite::class, 'register' ) );

		add_action(
			'template_redirect',
			static function () use ( $container ) {
				/**
				 * The shared PortalPage instance.
				 *
				 * @var PortalPage $page
				 */
				$page = $container->get( PortalPage::class );
				$page->handle_request();
			}
		);

		add_filter(
			'login_redirect',
			static function ( $redirect_to, $requested_redirect_to, $user ) use ( $container ) {
				/**
				 * The shared PortalPage instance.
				 *
				 * @var PortalPage $page
				 */
				$page = $container->get( PortalPage::class );
				return $page->filter_login_redirect( $redirect_to, $requested_redirect_to, $user );
			},
			10,
			3
		);
	}
}
```

- [ ] **Step 6: Register the provider in `config/app.php`**

Add `\Nutrio\Providers\PortalServiceProvider::class,` to the `'providers'` array, after `AdminServiceProvider::class`.

- [ ] **Step 7: Verify with phpcs, phpstan, and the full suite**

Run: `vendor/bin/phpcs includes/Clients/PortalPage.php includes/Providers/PortalServiceProvider.php config/app.php && vendor/bin/phpstan analyse includes/Clients/PortalPage.php includes/Providers/PortalServiceProvider.php && composer test`
Expected: No errors; full suite green.

- [ ] **Step 8: Commit**

```bash
git add includes/Clients/PortalPage.php includes/Providers/PortalServiceProvider.php config/app.php tests/Unit/Clients/PortalPageTest.php
git commit -m "$(cat <<'EOF'
feat: add PortalPage request handling and PHP-side extensibility hooks

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `types.ts` additions + webpack entry + `client-portal/index.tsx` bootstrap

**Files:**
- Modify: `src/types.ts`
- Modify: `webpack.config.js`
- Create: `src/client-portal/index.tsx`

**Interfaces:**
- Produces: `LogEntry`, `LogEntryInput`, `Measurement`, `MeasurementInput` types, `Window.nutrioClientPortal` global shape — used by every remaining task.

- [ ] **Step 1: Add types to `src/types.ts`**

Add these interfaces (near the existing `PlanItem`/`Plan` interfaces — the `Plan` type returned by `GET /me/plan` is the SAME shape as the existing `Plan` interface, so no new plan-specific type is needed):

```ts
export interface LogEntry {
	id: number;
	client_id: number;
	plan_item_id: number | null;
	food_id: number | null;
	recipe_id: number | null;
	quantity_grams: number | null;
	servings: number | null;
	log_date: string;
	status: 'eaten' | 'substituted' | 'skipped';
	source: 'manual' | 'ai_parsed';
	notes: string | null;
	created_at: string;
}

export interface LogEntryInput {
	plan_item_id?: number;
	food_id?: number;
	recipe_id?: number;
	quantity_grams?: number;
	servings?: number;
	log_date: string;
	status: 'eaten' | 'substituted' | 'skipped';
	notes?: string;
}

export interface Measurement {
	id: number;
	client_id: number;
	measured_at: string;
	weight_grams: number | null;
	metrics: Record< string, unknown >;
	notes: string | null;
	created_at: string;
}

export interface MeasurementInput {
	measured_at: string;
	weight_grams?: number;
	notes?: string;
}
```

Also add, inside the existing `declare global { interface Window { ... } }` block, a sibling to `nutrioAdmin`:

```ts
		nutrioClientPortal?: {
			restUrl?: string;
			restNonce?: string;
			mountId?: string;
			clientName?: string;
			dateFormat?: string;
		};
```

- [ ] **Step 2: Add the webpack entry**

In `webpack.config.js`, change:

```js
	entry: {
		admin: path.resolve( __dirname, 'src/admin/index.tsx' ),
	},
```

to:

```js
	entry: {
		admin: path.resolve( __dirname, 'src/admin/index.tsx' ),
		'client-portal': path.resolve(
			__dirname,
			'src/client-portal/index.tsx'
		),
	},
```

- [ ] **Step 3: Create `src/client-portal/index.tsx`**

```tsx
import { createRoot } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import '../styles/tokens.css';
import '../styles/base.css';
import App from './App';

const settings = window.nutrioClientPortal ?? {};

// Point api-fetch at this site's REST root and authenticate as the logged-in user.
if ( settings.restUrl ) {
	apiFetch.use( apiFetch.createRootURLMiddleware( settings.restUrl ) );
}
if ( settings.restNonce ) {
	apiFetch.use( apiFetch.createNonceMiddleware( settings.restNonce ) );
}

domReady( () => {
	const el = document.getElementById(
		settings.mountId ?? 'nutrio-client-portal-app'
	);

	if ( el ) {
		createRoot( el ).render( <App /> );
	}
} );

function domReady( callback: () => void ): void {
	if ( document.readyState !== 'loading' ) {
		callback();
		return;
	}

	document.addEventListener( 'DOMContentLoaded', callback );
}
```

This will fail to compile until Task 4 creates `./App` — that's expected; this task's own verification only checks types.ts and the webpack config, not a full build.

- [ ] **Step 4: Verify the parts that compile standalone**

The project-wide `tsc --noEmit` (`npm run check-types`) will report an error on `src/client-portal/index.tsx`'s `import App from './App'` since `App.tsx` doesn't exist until Task 4 — that one error is expected here. Confirm `types.ts` itself introduces no error:

Run: `npm run check-types 2>&1 | grep "types.ts"`
Expected: no output (no error attributed to `types.ts` itself; the only error should be `client-portal/index.tsx` unable to find `./App`, which Task 4 resolves).

- [ ] **Step 5: Commit**

```bash
git add src/types.ts webpack.config.js src/client-portal/index.tsx
git commit -m "$(cat <<'EOF'
feat: add client-portal types, webpack entry, and bootstrap script

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `App.tsx` — tab shell + JS-side extensibility hooks

**Files:**
- Create: `src/client-portal/App.tsx`
- Create: `src/client-portal/App.module.css`

**Interfaces:**
- Consumes: `window.nutrioClientPortal` (Task 3).
- Produces: the `App` default export Task 3's `index.tsx` renders; a `Section` type (`{ id: string; label: string; component: () => JSX.Element }`) that Tasks 5-7's tab screens are registered under.

- [ ] **Step 1: Create `App.tsx`**

```tsx
import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { applyFilters, doAction } from '@wordpress/hooks';
import PlanTab from './PlanTab';
import LogTab from './LogTab';
import MeasurementsTab from './MeasurementsTab';
import styles from './App.module.css';

export interface Section {
	id: string;
	label: string;
	component: () => JSX.Element;
}

// The built-in tabs. A future add-on's own bundle (enqueued via the
// PHP `nutrio_client_portal_render` action) can append, remove, or
// reorder entries here via the `nutrio.clientPortal.sections` filter
// below — the JS-side counterpart to the PHP
// `nutrio_client_portal_bootstrap_data` filter.
const DEFAULT_SECTIONS: Section[] = [
	{ id: 'plan', label: __( 'My Plan', 'nutrio' ), component: PlanTab },
	{ id: 'log', label: __( 'Log', 'nutrio' ), component: LogTab },
	{
		id: 'measurements',
		label: __( 'Measurements', 'nutrio' ),
		component: MeasurementsTab,
	},
];

export default function App() {
	const sections: Section[] = applyFilters(
		'nutrio.clientPortal.sections',
		DEFAULT_SECTIONS
	) as Section[];

	const [ activeId, setActiveId ] = useState( sections[ 0 ]?.id ?? 'plan' );
	const active = sections.find( ( section ) => section.id === activeId );

	doAction( 'nutrio.clientPortal.mounted' );

	const clientName = window.nutrioClientPortal?.clientName ?? '';

	return (
		<div className={ styles.shell }>
			<header className={ styles.header }>
				<h1 className={ styles.title }>
					{ __( 'Client Portal', 'nutrio' ) }
				</h1>
				{ clientName && (
					<span className={ styles.greeting }>
						{ clientName }
					</span>
				) }
			</header>
			<nav className={ styles.tabs }>
				{ sections.map( ( section ) => (
					<button
						key={ section.id }
						type="button"
						className={ `${ styles.tab } ${
							section.id === activeId ? styles.tabActive : ''
						}`.trim() }
						onClick={ () => setActiveId( section.id ) }
					>
						{ section.label }
					</button>
				) ) }
			</nav>
			<main className={ styles.content }>
				{ active ? <active.component /> : null }
			</main>
		</div>
	);
}
```

- [ ] **Step 2: Create `App.module.css`**

```css
.shell {
	max-width: 640px;
	margin: 0 auto;
	padding: 24px 16px 60px;
	font-family: var(--font-sans, sans-serif);
}
.header {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	margin-bottom: 20px;
}
.title {
	font-size: 22px;
	margin: 0;
}
.greeting {
	color: var(--text-muted, #666);
	font-size: 14px;
}
.tabs {
	display: flex;
	gap: 6px;
	border-bottom: 1px solid var(--border, #e2e2e2);
	margin-bottom: 20px;
}
.tab {
	background: none;
	border: none;
	padding: 10px 14px;
	font-size: 14px;
	cursor: pointer;
	border-bottom: 2px solid transparent;
}
.tabActive {
	border-bottom-color: var(--sage, #6b8f71);
	font-weight: 600;
}
.content {
	min-height: 200px;
}
```

- [ ] **Step 3: Verify types compile (this is the first point the whole entry compiles, once PlanTab/LogTab/MeasurementsTab exist as stubs)**

Since `PlanTab`/`LogTab`/`MeasurementsTab` don't exist yet, create temporary minimal stubs so this task's `npm run check-types` passes standalone — Tasks 5-7 will replace each stub with its real implementation:

Create `src/client-portal/PlanTab.tsx`:
```tsx
export default function PlanTab() {
	return null;
}
```

Create `src/client-portal/LogTab.tsx`:
```tsx
export default function LogTab() {
	return null;
}
```

Create `src/client-portal/MeasurementsTab.tsx`:
```tsx
export default function MeasurementsTab() {
	return null;
}
```

Run: `npm run check-types`
Expected: no errors.

Run: `npx wp-scripts lint-js src/client-portal/`
Expected: no errors (fix any prettier/formatting issues with `--fix` if needed).

- [ ] **Step 4: Commit**

```bash
git add src/client-portal/App.tsx src/client-portal/App.module.css src/client-portal/PlanTab.tsx src/client-portal/LogTab.tsx src/client-portal/MeasurementsTab.tsx
git commit -m "$(cat <<'EOF'
feat: add client-portal App shell with JS-side extensibility hooks

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `PlanTab` — read-only plan view

**Files:**
- Modify: `src/client-portal/PlanTab.tsx` (replacing Task 4's stub)

**Interfaces:**
- Consumes: `Plan`, `PlanDay`, `PlanItem` types (already in `src/types.ts`), `GET /me/plan` (returns `Plan | null`).

- [ ] **Step 1: Implement `PlanTab.tsx`**

```tsx
import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import type { Plan } from '../types';
import styles from './PlanTab.module.css';

export default function PlanTab() {
	const [ plan, setPlan ] = useState< Plan | null | undefined >(
		undefined
	);

	useEffect( () => {
		apiFetch< Plan | null >( { path: '/nutrio/v1/me/plan' } ).then(
			setPlan,
			() => setPlan( null )
		);
	}, [] );

	if ( undefined === plan ) {
		return <p>{ __( 'Loading…', 'nutrio' ) }</p>;
	}

	if ( null === plan ) {
		return (
			<p className={ styles.empty }>
				{ __(
					'No plan assigned yet — check back once your practitioner assigns one.',
					'nutrio'
				) }
			</p>
		);
	}

	return (
		<div>
			<h2 className={ styles.planTitle }>{ plan.title }</h2>
			<p className={ styles.dateRange }>
				{ plan.start_date } – { plan.end_date }
			</p>
			{ plan.days.map( ( day ) => (
				<div key={ day.day_offset } className={ styles.day }>
					<h3 className={ styles.dayTitle }>
						{ __( 'Day', 'nutrio' ) } { day.day_offset + 1 }
					</h3>
					<ul className={ styles.itemList }>
						{ day.items.map( ( item ) => (
							<li key={ item.id } className={ styles.item }>
								<span className={ styles.mealType }>
									{ item.meal_type }
								</span>
								{ ' — ' }
								{ item.food_description ??
									item.recipe_name ??
									__( 'Item', 'nutrio' ) }
							</li>
						) ) }
					</ul>
				</div>
			) ) }
		</div>
	);
}
```

- [ ] **Step 2: Create `PlanTab.module.css`**

```css
.empty {
	color: var(--text-muted, #666);
}
.planTitle {
	margin: 0 0 4px;
}
.dateRange {
	color: var(--text-muted, #666);
	font-size: 13px;
	margin: 0 0 20px;
}
.day {
	margin-bottom: 16px;
}
.dayTitle {
	font-size: 14px;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--text-muted, #666);
	margin: 0 0 8px;
}
.itemList {
	list-style: none;
	margin: 0;
	padding: 0;
}
.item {
	padding: 8px 0;
	border-bottom: 1px solid var(--border, #eee);
}
.mealType {
	text-transform: capitalize;
	font-weight: 600;
}
```

- [ ] **Step 3: Verify**

Run: `npm run check-types && npx wp-scripts lint-js src/client-portal/`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/client-portal/PlanTab.tsx src/client-portal/PlanTab.module.css
git commit -m "$(cat <<'EOF'
feat: implement client-portal PlanTab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `LogTab` — plan-first compliance logging + ad-hoc entry

**Files:**
- Modify: `src/client-portal/LogTab.tsx` (replacing Task 4's stub)

**Interfaces:**
- Consumes: `Plan`, `PlanItem`, `LogEntryInput` types, `GET /me/plan`, `POST /me/logs`.
- Produces: fires `doAction( 'nutrio.clientPortal.logCreated', entry )` after each successful POST (per the spec's JS-hooks section).

- [ ] **Step 1: Implement `LogTab.tsx`**

```tsx
import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import { doAction } from '@wordpress/hooks';
import Button from '../components/ui/Button';
import type { LogEntry, LogEntryInput, Plan, PlanItem } from '../types';
import styles from './LogTab.module.css';

type Status = 'eaten' | 'substituted' | 'skipped';

export default function LogTab() {
	const [ plan, setPlan ] = useState< Plan | null | undefined >(
		undefined
	);
	const [ notes, setNotes ] = useState( '' );
	const [ isSubmittingAdHoc, setIsSubmittingAdHoc ] = useState( false );
	const [ pendingItemId, setPendingItemId ] = useState< number | null >(
		null
	);

	useEffect( () => {
		apiFetch< Plan | null >( { path: '/nutrio/v1/me/plan' } ).then(
			setPlan,
			() => setPlan( null )
		);
	}, [] );

	const today = new Date().toISOString().slice( 0, 10 );

	const logPlanItem = async ( item: PlanItem, status: Status ) => {
		setPendingItemId( item.id );

		const payload: LogEntryInput = {
			plan_item_id: item.id,
			food_id: item.food_id ?? undefined,
			recipe_id: item.recipe_id ?? undefined,
			quantity_grams: item.quantity_grams ?? undefined,
			servings: item.servings ?? undefined,
			log_date: today,
			status,
		};

		try {
			const entry = await apiFetch< LogEntry >( {
				path: '/nutrio/v1/me/logs',
				method: 'POST',
				data: payload,
			} );
			doAction( 'nutrio.clientPortal.logCreated', entry );
		} finally {
			setPendingItemId( null );
		}
	};

	const logAdHoc = async ( event: React.FormEvent ) => {
		event.preventDefault();
		setIsSubmittingAdHoc( true );

		try {
			const entry = await apiFetch< LogEntry >( {
				path: '/nutrio/v1/me/logs',
				method: 'POST',
				data: {
					log_date: today,
					status: 'eaten',
					notes,
				} as LogEntryInput,
			} );
			doAction( 'nutrio.clientPortal.logCreated', entry );
			setNotes( '' );
		} finally {
			setIsSubmittingAdHoc( false );
		}
	};

	const todaysItems: PlanItem[] =
		undefined !== plan && null !== plan
			? plan.days[ 0 ]?.items ?? []
			: [];

	return (
		<div>
			{ undefined === plan && <p>{ __( 'Loading…', 'nutrio' ) }</p> }

			{ null === plan && (
				<p className={ styles.empty }>
					{ __(
						'No plan assigned yet — check back once your practitioner assigns one.',
						'nutrio'
					) }
				</p>
			) }

			{ plan && todaysItems.length > 0 && (
				<ul className={ styles.itemList }>
					{ todaysItems.map( ( item ) => (
						<li key={ item.id } className={ styles.item }>
							<span>
								{ item.food_description ??
									item.recipe_name ??
									__( 'Item', 'nutrio' ) }
							</span>
							<div className={ styles.actions }>
								<Button
									variant="ghost"
									disabled={ pendingItemId === item.id }
									onClick={ () =>
										logPlanItem( item, 'eaten' )
									}
								>
									{ __( 'Mark eaten', 'nutrio' ) }
								</Button>
								<Button
									variant="ghost"
									disabled={ pendingItemId === item.id }
									onClick={ () =>
										logPlanItem( item, 'substituted' )
									}
								>
									{ __( 'Substituted', 'nutrio' ) }
								</Button>
								<Button
									variant="ghost"
									disabled={ pendingItemId === item.id }
									onClick={ () =>
										logPlanItem( item, 'skipped' )
									}
								>
									{ __( 'Skip', 'nutrio' ) }
								</Button>
							</div>
						</li>
					) ) }
				</ul>
			) }

			<form onSubmit={ logAdHoc } className={ styles.adHocForm }>
				<label htmlFor="nutrio-log-notes">
					{ __( 'Log something else', 'nutrio' ) }
				</label>
				<textarea
					id="nutrio-log-notes"
					value={ notes }
					onChange={ ( event ) => setNotes( event.target.value ) }
					placeholder={ __(
						'What did you eat?',
						'nutrio'
					) }
					required
				/>
				<Button
					type="submit"
					variant="primary"
					disabled={ isSubmittingAdHoc }
				>
					{ __( 'Log it', 'nutrio' ) }
				</Button>
			</form>
		</div>
	);
}
```

- [ ] **Step 2: Create `LogTab.module.css`**

```css
.empty {
	color: var(--text-muted, #666);
}
.itemList {
	list-style: none;
	margin: 0 0 24px;
	padding: 0;
}
.item {
	padding: 10px 0;
	border-bottom: 1px solid var(--border, #eee);
}
.actions {
	display: flex;
	gap: 6px;
	margin-top: 6px;
}
.adHocForm {
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.adHocForm textarea {
	min-height: 70px;
	padding: 8px;
	font-family: inherit;
}
```

- [ ] **Step 3: Verify**

Run: `npm run check-types && npx wp-scripts lint-js src/client-portal/`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/client-portal/LogTab.tsx src/client-portal/LogTab.module.css
git commit -m "$(cat <<'EOF'
feat: implement client-portal LogTab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `MeasurementsTab` — weight logging + history

**Files:**
- Modify: `src/client-portal/MeasurementsTab.tsx` (replacing Task 4's stub)

**Interfaces:**
- Consumes: `Measurement`, `MeasurementInput` types, `GET /me/measurements`, `POST /me/measurements`.
- Produces: fires `doAction( 'nutrio.clientPortal.measurementCreated', entry )` after each successful POST.

- [ ] **Step 1: Implement `MeasurementsTab.tsx`**

Per the spec, weight only for v1; the unit-preference toggle (kg/lb) is a per-viewer `localStorage` convenience, wrapped in try/catch since it's not guaranteed available:

```tsx
import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import { doAction } from '@wordpress/hooks';
import Button from '../components/ui/Button';
import type { Measurement, MeasurementInput } from '../types';
import styles from './MeasurementsTab.module.css';

type Unit = 'kg' | 'lb';

const UNIT_STORAGE_KEY = 'nutrio-client-portal-weight-unit';

function readStoredUnit(): Unit {
	try {
		const stored = window.localStorage.getItem( UNIT_STORAGE_KEY );
		return 'lb' === stored ? 'lb' : 'kg';
	} catch ( error ) {
		return 'kg';
	}
}

function storeUnit( unit: Unit ): void {
	try {
		window.localStorage.setItem( UNIT_STORAGE_KEY, unit );
	} catch ( error ) {
		// Private browsing / blocked storage — the preference just won't persist.
	}
}

function gramsToDisplay( grams: number, unit: Unit ): number {
	return Math.round(
		( 'lb' === unit ? grams / 453.592 : grams / 1000 ) * 10
	) / 10;
}

function displayToGrams( value: number, unit: Unit ): number {
	return Math.round( 'lb' === unit ? value * 453.592 : value * 1000 );
}

export default function MeasurementsTab() {
	const [ unit, setUnit ] = useState< Unit >( readStoredUnit );
	const [ measurements, setMeasurements ] = useState<
		Measurement[] | undefined
	>( undefined );
	const [ weightInput, setWeightInput ] = useState( '' );
	const [ isSubmitting, setIsSubmitting ] = useState( false );

	const loadMeasurements = () => {
		apiFetch< Measurement[] >( {
			path: '/nutrio/v1/me/measurements',
		} ).then( setMeasurements, () => setMeasurements( [] ) );
	};

	useEffect( loadMeasurements, [] );

	const changeUnit = ( next: Unit ) => {
		setUnit( next );
		storeUnit( next );
	};

	const submit = async ( event: React.FormEvent ) => {
		event.preventDefault();
		const value = parseFloat( weightInput );

		if ( ! value || value <= 0 ) {
			return;
		}

		setIsSubmitting( true );

		try {
			const payload: MeasurementInput = {
				measured_at: new Date().toISOString().slice( 0, 10 ),
				weight_grams: displayToGrams( value, unit ),
			};
			const entry = await apiFetch< Measurement >( {
				path: '/nutrio/v1/me/measurements',
				method: 'POST',
				data: payload,
			} );
			doAction( 'nutrio.clientPortal.measurementCreated', entry );
			setWeightInput( '' );
			loadMeasurements();
		} finally {
			setIsSubmitting( false );
		}
	};

	return (
		<div>
			<form onSubmit={ submit } className={ styles.form }>
				<label htmlFor="nutrio-weight-input">
					{ __( 'Weight', 'nutrio' ) }
				</label>
				<div className={ styles.weightRow }>
					<input
						id="nutrio-weight-input"
						type="number"
						step="0.1"
						min="0"
						value={ weightInput }
						onChange={ ( event ) =>
							setWeightInput( event.target.value )
						}
						required
					/>
					<select
						value={ unit }
						onChange={ ( event ) =>
							changeUnit( event.target.value as Unit )
						}
					>
						<option value="kg">{ __( 'kg', 'nutrio' ) }</option>
						<option value="lb">{ __( 'lb', 'nutrio' ) }</option>
					</select>
				</div>
				<Button type="submit" variant="primary" disabled={ isSubmitting }>
					{ __( 'Log weight', 'nutrio' ) }
				</Button>
			</form>

			<h3 className={ styles.historyTitle }>
				{ __( 'History', 'nutrio' ) }
			</h3>
			{ undefined === measurements && (
				<p>{ __( 'Loading…', 'nutrio' ) }</p>
			) }
			{ measurements && 0 === measurements.length && (
				<p className={ styles.empty }>
					{ __( 'No measurements logged yet.', 'nutrio' ) }
				</p>
			) }
			{ measurements && measurements.length > 0 && (
				<ul className={ styles.historyList }>
					{ measurements.map( ( measurement ) => (
						<li key={ measurement.id } className={ styles.historyItem }>
							<span>{ measurement.measured_at }</span>
							<span>
								{ null !== measurement.weight_grams
									? `${ gramsToDisplay(
											measurement.weight_grams,
											unit
									  ) } ${ unit }`
									: '—' }
							</span>
						</li>
					) ) }
				</ul>
			) }
		</div>
	);
}
```

- [ ] **Step 2: Create `MeasurementsTab.module.css`**

```css
.form {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin-bottom: 28px;
}
.weightRow {
	display: flex;
	gap: 8px;
}
.weightRow input {
	flex: 1;
	padding: 8px;
}
.weightRow select {
	padding: 8px;
}
.historyTitle {
	font-size: 14px;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--text-muted, #666);
	margin: 0 0 8px;
}
.empty {
	color: var(--text-muted, #666);
}
.historyList {
	list-style: none;
	margin: 0;
	padding: 0;
}
.historyItem {
	display: flex;
	justify-content: space-between;
	padding: 8px 0;
	border-bottom: 1px solid var(--border, #eee);
}
```

- [ ] **Step 3: Verify**

Run: `npm run check-types && npx wp-scripts lint-js src/client-portal/`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/client-portal/MeasurementsTab.tsx src/client-portal/MeasurementsTab.module.css
git commit -m "$(cat <<'EOF'
feat: implement client-portal MeasurementsTab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Final verification pass

**Files:** None changed — this task only verifies, plus a `JOURNEY.md` update.

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: succeeds, produces `build/client-portal.js` and `build/client-portal.asset.php` alongside the existing `build/admin.*` files.

- [ ] **Step 2: Full test suite, phpcs, phpstan, php -l**

```bash
composer test
vendor/bin/phpcs includes/Clients/PortalRewrite.php includes/Clients/PortalPage.php includes/Providers/PortalServiceProvider.php config/app.php
vendor/bin/phpstan analyse includes/Clients/ includes/Providers/PortalServiceProvider.php
for f in includes/Clients/PortalRewrite.php includes/Clients/PortalPage.php includes/Providers/PortalServiceProvider.php; do php -l "$f"; done
```
Expected: all green, no errors.

- [ ] **Step 3: Full JS verification**

```bash
npm run check-types
npx wp-scripts lint-js src/
```
Expected: no errors.

- [ ] **Step 4: Update `JOURNEY.md`**

Read `JOURNEY.md`'s Phase-3 bullet (updated by the backend plan to mention the invite route and `/me/*` endpoints existing, with client-facing screens noted as a "separate, not-yet-built follow-up"). Update that same bullet (or add a new one directly after it) to say the client-portal front-end now exists: a permalink-agnostic `/client-portal/` route, login form, and a tabbed React app (Plan/Log/Measurements) consuming those endpoints — keep it as terse as the surrounding bullets.

- [ ] **Step 5: Commit**

```bash
git add JOURNEY.md
git commit -m "$(cat <<'EOF'
docs: note client-portal frontend as built

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
