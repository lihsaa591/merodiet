# Client-Portal Backend (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a client a scoped portal login and the REST surface (today's plan, compliance logs, measurements) a future client UI will consume, plus the practitioner-side invite action that provisions it.

**Architecture:** A new `AbstractClientController` mirrors the existing `AbstractPractitionerController` pattern but resolves the caller's own `client_id` via `ClientRepository::find_for_user()` instead of trusting any request param. Two new repositories (`LogEntryRepository`, `MeasurementRepository`) follow the exact `*_for_client()` shape the four existing repositories already use for `*_for_practitioner()`. A standalone `ClientInviteService` provisions the WP user and reuses WordPress core's own password-reset email flow — no bespoke token storage.

**Tech Stack:** PHP 8.1, `$wpdb` direct queries (project convention — no ORM), `league/container` DI wired via `config/app.php`, PHPUnit + Brain Monkey for unit tests (no real-DB test suite exists in this repo yet — see Global Constraints).

**Spec:** `docs/superpowers/specs/2026-09-19-client-portal-backend-design.md`

## Global Constraints

- PHP 8.1, `declare( strict_types=1 );` at the top of every file, matching every existing file in `includes/`.
- Every REST route must pass an explicit `required_capability` to `register_route()` — never rely on the `manage_options` default (see `AbstractController`'s own docblock and `ControllerCapabilitiesTest`).
- Repository classes are **not** unit-tested against a real database in this repo — `tests/bootstrap.php` is explicitly a pure Brain-Monkey suite with "no database, no WP install required," and none of the four existing repositories (`ClientRepository`, `PlanRepository`, `RecipeRepository`, `CustomFoodRepository`) have test files. New repositories in this plan follow that same, already-established pattern: write the repository code, no repository-level test file. Only pure logic (`ClientInviteService`) and controller capability-gating get unit tests, matching `ControllerCapabilitiesTest`'s existing style.
- Every new/changed PHP file must pass `vendor/bin/phpcs` and `php -l` before being committed (project convention throughout this codebase).
- Run `composer test` after every task and keep it green (currently 58 tests / 119 assertions — this plan's tests add to that count, never break it).
- Money/quantity values already in the schema are integers/decimals in fixed units (see `weight_grams`, `quantity_grams`) — nothing in this plan introduces a new float-for-arithmetic column.
- Commit after each task, following this repo's existing commit style (`feat: ...`, `fix: ...`) with the `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` trailer.

---

### Task 1: `QueryFilters::date_range_clause()` + `ClientRepository` additions

**Files:**
- Modify: `includes/Database/QueryFilters.php`
- Modify: `includes/Repositories/ClientRepository.php`
- Test: `tests/Unit/Database/QueryFiltersTest.php` (create if it doesn't already cover this — check first with `ls tests/Unit/Database/`)

**Interfaces:**
- Produces: `QueryFilters::date_range_clause( array $filters, string $from_key, string $to_key, string $column, array &$params ): ?string` — used by both `LogEntryRepository` and `MeasurementRepository` in Tasks 2–3.
- Produces: `ClientRepository::find_for_user( int $user_id ): ?array` — used by `AbstractClientController` in Task 4.
- Produces: `ClientRepository::set_user_id( int $client_id, int $user_id ): void` — used by `ClientInviteService` in Task 5.

- [ ] **Step 1: Check for an existing QueryFilters test file**

Run: `ls tests/Unit/Database/ 2>/dev/null`

If `QueryFiltersTest.php` exists, read it and add the new test method into it. If it doesn't exist, create it fresh with the class skeleton below plus the one test method.

- [ ] **Step 2: Write the failing test for `date_range_clause()`**

```php
<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit\Database;

use MeroDiet\Database\QueryFilters;
use MeroDiet\Tests\TestCase;

final class QueryFiltersTest extends TestCase {

	public function test_date_range_clause_returns_null_when_neither_bound_supplied(): void {
		$params = array();

		$clause = QueryFilters::date_range_clause( array(), 'from', 'to', 'log_date', $params );

		self::assertNull( $clause );
		self::assertSame( array(), $params );
	}

	public function test_date_range_clause_combines_both_bounds_with_and(): void {
		$params = array();

		$clause = QueryFilters::date_range_clause(
			array(
				'from' => '2026-09-01',
				'to'   => '2026-09-30',
			),
			'from',
			'to',
			'log_date',
			$params
		);

		self::assertSame( 'log_date >= %s AND log_date <= %s', $clause );
		self::assertSame( array( '2026-09-01', '2026-09-30' ), $params );
	}

	public function test_date_range_clause_supports_a_single_open_ended_bound(): void {
		$params = array();

		$clause = QueryFilters::date_range_clause(
			array( 'from' => '2026-09-01' ),
			'from',
			'to',
			'log_date',
			$params
		);

		self::assertSame( 'log_date >= %s', $clause );
		self::assertSame( array( '2026-09-01' ), $params );
	}
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `composer test -- --filter QueryFiltersTest`
Expected: FAIL — `Call to undefined method MeroDiet\Database\QueryFilters::date_range_clause()`.

- [ ] **Step 4: Implement `date_range_clause()`**

Add this method to `includes/Database/QueryFilters.php`, alongside `search_clause()`/`exact_clause()`:

```php
	/**
	 * An inclusive date-range filter against one column — used by any
	 * list that supports a "from"/"to" window (log entries,
	 * measurements). Either bound may be supplied alone for an
	 * open-ended range. Returns null (and leaves $params untouched) if
	 * neither bound was supplied.
	 *
	 * @param array<string, mixed> $filters Filter values, keyed by filter name.
	 * @param string               $from_key Which key in $filters holds the inclusive lower bound.
	 * @param string               $to_key   Which key in $filters holds the inclusive upper bound.
	 * @param string               $column   Column to range against.
	 * @param array<int, mixed>    $params   Bound params array to append to, by reference.
	 */
	public static function date_range_clause( array $filters, string $from_key, string $to_key, string $column, array &$params ): ?string {
		$from = trim( (string) ( $filters[ $from_key ] ?? '' ) );
		$to   = trim( (string) ( $filters[ $to_key ] ?? '' ) );

		$conditions = array();

		if ( '' !== $from ) {
			$conditions[] = "{$column} >= %s"; // phpcs:ignore WordPress.DB.PreparedSQLPlaceholders -- column name is a caller-supplied literal, not user input; the %s placeholder itself is filled via $wpdb->prepare() by the caller.
			$params[]     = $from;
		}

		if ( '' !== $to ) {
			$conditions[] = "{$column} <= %s"; // phpcs:ignore WordPress.DB.PreparedSQLPlaceholders -- column name is a caller-supplied literal, not user input; the %s placeholder itself is filled via $wpdb->prepare() by the caller.
			$params[]     = $to;
		}

		if ( array() === $conditions ) {
			return null;
		}

		return implode( ' AND ', $conditions );
	}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `composer test -- --filter QueryFiltersTest`
Expected: PASS (3 tests).

- [ ] **Step 6: Add `find_for_user()` and `set_user_id()` to `ClientRepository`**

Add both methods to `includes/Repositories/ClientRepository.php`, near `find_for_practitioner()`:

```php
	/**
	 * Find the client row linked to a given WordPress user — the lookup
	 * every client-portal request starts from (see
	 * AbstractClientController::current_client_id()). Returns null both
	 * when no client is linked to this user and when the user doesn't
	 * exist, which is the same "don't leak which case it is" posture
	 * find_for_practitioner() takes for practitioner-owned rows.
	 *
	 * @param int $user_id WordPress user ID of the logged-in client.
	 *
	 * @return array<string, mixed>|null
	 */
	public function find_for_user( int $user_id ): ?array {
		global $wpdb;

		$row = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}merodiet_clients WHERE user_id = %d", $user_id ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input; value is parameterized.
			ARRAY_A
		);

		return null === $row ? null : $this->hydrate( $row );
	}

	/**
	 * Link a client row to the WordPress user created for its portal
	 * login — see ClientInviteService, the only caller.
	 *
	 * @param int $client_id Internal client ID.
	 * @param int $user_id   WordPress user ID to link.
	 */
	public function set_user_id( int $client_id, int $user_id ): void {
		global $wpdb;

		$wpdb->update(
			$wpdb->prefix . 'merodiet_clients',
			array(
				'user_id'    => $user_id,
				'updated_at' => current_time( 'mysql' ),
			),
			array( 'id' => $client_id )
		);
	}
```

- [ ] **Step 7: Verify with phpcs and the full suite**

Run: `vendor/bin/phpcs includes/Database/QueryFilters.php includes/Repositories/ClientRepository.php && composer test`
Expected: No phpcs errors; full suite green.

- [ ] **Step 8: Commit**

```bash
git add includes/Database/QueryFilters.php includes/Repositories/ClientRepository.php tests/Unit/Database/QueryFiltersTest.php
git commit -m "$(cat <<'EOF'
feat: add date-range filter helper and client-by-user lookup

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `LogEntryRepository`

**Files:**
- Create: `includes/Repositories/LogEntryRepository.php`

**Interfaces:**
- Consumes: `QueryFilters::combine()`, `QueryFilters::date_range_clause()` (Task 1).
- Produces: `create_for_client( int $client_id, array $data ): int`, `all_for_client( int $client_id, array $filters = array() ): array`, `find( int $id ): ?array` — used by `MeController` in Task 8.

- [ ] **Step 1: Create the repository**

```php
<?php
/**
 * Client compliance-log data access.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Repositories;

use MeroDiet\Database\QueryFilters;

/**
 * Every read/write method here takes the client's own internal ID —
 * scoping happens one layer up, in AbstractClientController::
 * current_client_id(), which resolves it from the logged-in WP user
 * and never trusts a client_id supplied in the request itself. See
 * ClientRepository's docblock for the same defense-in-depth reasoning
 * applied to practitioner-owned rows.
 */
class LogEntryRepository {

	/**
	 * Insert one log entry for a client.
	 *
	 * @param int                                                                                                                                                                    $client_id Owning client's internal ID.
	 * @param array{plan_item_id?:int, food_id?:int, recipe_id?:int, quantity_grams?:float, servings?:float, log_date:string, status:string, source?:string, notes?:string} $data      Entry fields.
	 *
	 * @return int The new entry's internal ID.
	 */
	public function create_for_client( int $client_id, array $data ): int {
		global $wpdb;

		$wpdb->insert(
			$wpdb->prefix . 'merodiet_log_entries',
			array(
				'client_id'      => $client_id,
				'plan_item_id'   => $data['plan_item_id'] ?? null,
				'food_id'        => $data['food_id'] ?? null,
				'recipe_id'      => $data['recipe_id'] ?? null,
				'quantity_grams' => $data['quantity_grams'] ?? null,
				'servings'       => $data['servings'] ?? null,
				'log_date'       => $data['log_date'],
				'status'         => $data['status'],
				'source'         => $data['source'] ?? 'manual',
				'notes'          => $data['notes'] ?? null,
				'created_at'     => current_time( 'mysql' ),
			)
		);

		$id = (int) $wpdb->insert_id;

		// Fires after a client logs a compliance entry.
		do_action( 'merodiet_log_entry_created', $id, $data, $client_id );

		return $id;
	}

	/**
	 * A client's log entries, most recent first, optionally windowed by
	 * date. $filters supports 'from'/'to' (inclusive, either optional).
	 *
	 * @param int                   $client_id Owning client's internal ID.
	 * @param array<string, string> $filters   Optional filters — 'from', 'to'.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public function all_for_client( int $client_id, array $filters = array() ): array {
		global $wpdb;

		$table  = $wpdb->prefix . 'merodiet_log_entries';
		$params = array( $client_id );

		$where = QueryFilters::combine(
			'client_id = %d',
			array(
				QueryFilters::date_range_clause( $filters, 'from', 'to', 'log_date', $params ),
			)
		);

		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders -- table name and WHERE clause are built from fixed strings and caller-supplied literals, not user input; every value is bound via prepare()'s own placeholders. phpcs's static count of "%s"/"%d" tokens can't see through the ...$params spread, hence the placeholder-count warnings below.
		$found = $wpdb->get_results(
			$wpdb->prepare( "SELECT * FROM {$table} WHERE {$where} ORDER BY log_date DESC, id DESC", ...$params ),
			ARRAY_A
		);
		// phpcs:enable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders

		$rows = null === $found ? array() : $found;

		return array_map( array( $this, 'hydrate' ), $rows );
	}

	/**
	 * Find a log entry by ID, regardless of owner — callers must verify
	 * ownership (compare the returned row's client_id) before exposing
	 * or mutating it.
	 *
	 * @param int $id Internal entry ID.
	 *
	 * @return array<string, mixed>|null
	 */
	public function find( int $id ): ?array {
		global $wpdb;

		$row = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}merodiet_log_entries WHERE id = %d", $id ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input; value is parameterized.
			ARRAY_A
		);

		return null === $row ? null : $this->hydrate( $row );
	}

	/**
	 * Convert a raw database row into typed, decoded fields.
	 *
	 * @param array<string, mixed> $row Raw database row.
	 *
	 * @return array<string, mixed>
	 */
	private function hydrate( array $row ): array {
		$row['id']             = (int) $row['id'];
		$row['client_id']      = (int) $row['client_id'];
		$row['plan_item_id']   = null === $row['plan_item_id'] ? null : (int) $row['plan_item_id'];
		$row['food_id']        = null === $row['food_id'] ? null : (int) $row['food_id'];
		$row['recipe_id']      = null === $row['recipe_id'] ? null : (int) $row['recipe_id'];
		$row['quantity_grams'] = null === $row['quantity_grams'] ? null : (float) $row['quantity_grams'];
		$row['servings']       = null === $row['servings'] ? null : (float) $row['servings'];

		return $row;
	}
}
```

- [ ] **Step 2: Verify with phpcs and phpstan**

Run: `vendor/bin/phpcs includes/Repositories/LogEntryRepository.php && vendor/bin/phpstan analyse includes/Repositories/LogEntryRepository.php`
Expected: No errors.

- [ ] **Step 3: Run the full suite (no new tests here, per Global Constraints — confirm nothing else broke)**

Run: `composer test`
Expected: Still 58+ tests green (unchanged count from this task).

- [ ] **Step 4: Commit**

```bash
git add includes/Repositories/LogEntryRepository.php
git commit -m "$(cat <<'EOF'
feat: add LogEntryRepository for client compliance logging

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `MeasurementRepository`

**Files:**
- Create: `includes/Repositories/MeasurementRepository.php`

**Interfaces:**
- Consumes: `QueryFilters::combine()`, `QueryFilters::date_range_clause()` (Task 1).
- Produces: `create_for_client( int $client_id, array $data ): int`, `all_for_client( int $client_id, array $filters = array() ): array`, `find( int $id ): ?array` — used by `MeController` in Task 8.

- [ ] **Step 1: Create the repository**

```php
<?php
/**
 * Client body-measurement data access.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Repositories;

use MeroDiet\Database\QueryFilters;

/**
 * Same client-scoping posture as LogEntryRepository — every method
 * takes the client's own internal ID, resolved one layer up by
 * AbstractClientController, never a caller-supplied one.
 */
class MeasurementRepository {

	/**
	 * Insert one measurement for a client.
	 *
	 * @param int                                                                                     $client_id Owning client's internal ID.
	 * @param array{measured_at:string, weight_grams?:int, metrics?:array<string, mixed>, notes?:string} $data      Measurement fields.
	 *
	 * @return int The new measurement's internal ID.
	 */
	public function create_for_client( int $client_id, array $data ): int {
		global $wpdb;

		$wpdb->insert(
			$wpdb->prefix . 'merodiet_measurements',
			array(
				'client_id'    => $client_id,
				'measured_at'  => $data['measured_at'],
				'weight_grams' => $data['weight_grams'] ?? null,
				'metrics'      => wp_json_encode( $data['metrics'] ?? array() ),
				'notes'        => $data['notes'] ?? null,
				'created_at'   => current_time( 'mysql' ),
			)
		);

		$id = (int) $wpdb->insert_id;

		// Fires after a client logs a measurement.
		do_action( 'merodiet_measurement_created', $id, $data, $client_id );

		return $id;
	}

	/**
	 * A client's measurements, most recent first, optionally windowed
	 * by date. $filters supports 'from'/'to' (inclusive, either optional).
	 *
	 * @param int                   $client_id Owning client's internal ID.
	 * @param array<string, string> $filters   Optional filters — 'from', 'to'.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public function all_for_client( int $client_id, array $filters = array() ): array {
		global $wpdb;

		$table  = $wpdb->prefix . 'merodiet_measurements';
		$params = array( $client_id );

		$where = QueryFilters::combine(
			'client_id = %d',
			array(
				QueryFilters::date_range_clause( $filters, 'from', 'to', 'measured_at', $params ),
			)
		);

		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders -- table name and WHERE clause are built from fixed strings and caller-supplied literals, not user input; every value is bound via prepare()'s own placeholders. phpcs's static count of "%s"/"%d" tokens can't see through the ...$params spread, hence the placeholder-count warnings below.
		$found = $wpdb->get_results(
			$wpdb->prepare( "SELECT * FROM {$table} WHERE {$where} ORDER BY measured_at DESC, id DESC", ...$params ),
			ARRAY_A
		);
		// phpcs:enable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders

		$rows = null === $found ? array() : $found;

		return array_map( array( $this, 'hydrate' ), $rows );
	}

	/**
	 * Find a measurement by ID, regardless of owner — callers must
	 * verify ownership (compare the returned row's client_id) before
	 * exposing or mutating it.
	 *
	 * @param int $id Internal measurement ID.
	 *
	 * @return array<string, mixed>|null
	 */
	public function find( int $id ): ?array {
		global $wpdb;

		$row = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}merodiet_measurements WHERE id = %d", $id ), // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input; value is parameterized.
			ARRAY_A
		);

		return null === $row ? null : $this->hydrate( $row );
	}

	/**
	 * Convert a raw database row into typed, decoded fields.
	 *
	 * @param array<string, mixed> $row Raw database row.
	 *
	 * @return array<string, mixed>
	 */
	private function hydrate( array $row ): array {
		$row['id']            = (int) $row['id'];
		$row['client_id']     = (int) $row['client_id'];
		$row['weight_grams']  = null === $row['weight_grams'] ? null : (int) $row['weight_grams'];
		$row['metrics']       = (array) json_decode( (string) $row['metrics'], true );

		return $row;
	}
}
```

- [ ] **Step 2: Verify with phpcs and phpstan**

Run: `vendor/bin/phpcs includes/Repositories/MeasurementRepository.php && vendor/bin/phpstan analyse includes/Repositories/MeasurementRepository.php`
Expected: No errors.

- [ ] **Step 3: Run the full suite**

Run: `composer test`
Expected: Still green, unchanged test count.

- [ ] **Step 4: Commit**

```bash
git add includes/Repositories/MeasurementRepository.php
git commit -m "$(cat <<'EOF'
feat: add MeasurementRepository for client body measurements

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `AbstractClientController`

**Files:**
- Create: `includes/RestApi/AbstractClientController.php`
- Test: `tests/Unit/RestApi/AbstractClientControllerTest.php`

**Interfaces:**
- Consumes: `ClientRepository::find_for_user( int $user_id ): ?array` (Task 1), `AbstractController::register_route()`, `AbstractController::error()`.
- Produces: `current_client_id(): int|\WP_Error` and the abstract `client_repository(): ClientRepository` hook — implemented by `MeController` in Task 8.

- [ ] **Step 1: Write the failing test**

```php
<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit\RestApi;

use Brain\Monkey\Functions;
use MeroDiet\Repositories\ClientRepository;
use MeroDiet\RestApi\AbstractClientController;
use MeroDiet\Tests\TestCase;
use WP_Error;

final class AbstractClientControllerTest extends TestCase {

	public function test_current_client_id_resolves_via_the_logged_in_user(): void {
		Functions\when( 'get_current_user_id' )->justReturn( 42 );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_user' )
			->with( 42 )
			->willReturn( array( 'id' => 7 ) );

		$controller = new class( $clients ) extends AbstractClientController {
			protected string $rest_base = 'me';
			public function __construct( private readonly ClientRepository $clients ) {}
			protected function client_repository(): ClientRepository {
				return $this->clients;
			}
			public function register_routes(): void {}
		};

		self::assertSame( 7, $controller->current_client_id() );
	}

	public function test_current_client_id_errors_when_no_client_is_linked(): void {
		Functions\when( 'get_current_user_id' )->justReturn( 42 );
		Functions\when( '__' )->returnArg( 1 );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_user' )->willReturn( null );

		$controller = new class( $clients ) extends AbstractClientController {
			protected string $rest_base = 'me';
			public function __construct( private readonly ClientRepository $clients ) {}
			protected function client_repository(): ClientRepository {
				return $this->clients;
			}
			public function register_routes(): void {}
		};

		self::assertInstanceOf( WP_Error::class, $controller->current_client_id() );
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `composer test -- --filter AbstractClientControllerTest`
Expected: FAIL — class `MeroDiet\RestApi\AbstractClientController` not found.

- [ ] **Step 3: Implement `AbstractClientController`**

```php
<?php
/**
 * REST base for client-portal, self-service resources.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\RestApi;

use MeroDiet\Repositories\ClientRepository;
use WP_Error;

/**
 * Every resource a client's own portal touches — their plan, their
 * logs, their measurements — is scoped to their own client_id, which
 * this class resolves ONCE per request from the logged-in WP user, via
 * ClientRepository::find_for_user(). A client never supplies a
 * client_id in the request itself: there is nothing to spoof, because
 * nothing client-controllable ever reaches the repository layer as an
 * identifier. Mirrors AbstractPractitionerController's role for
 * practitioner-owned resources, but by construction rather than by a
 * per-request ownership check (see assert_owns()) — there is exactly
 * one client_id this controller can ever resolve to.
 */
abstract class AbstractClientController extends AbstractController {

	/**
	 * REST namespace shared by every client-portal resource.
	 *
	 * @var string
	 */
	protected string $namespace = 'merodiet/v1';

	/**
	 * The repository used to resolve the logged-in user to their own
	 * client row. Implemented by the concrete controller, which already
	 * holds a ClientRepository instance for its own routes (or can
	 * accept one solely for this purpose).
	 */
	abstract protected function client_repository(): ClientRepository;

	/**
	 * Resolve the current request's own internal client_id.
	 *
	 * @return int|WP_Error The client_id, or a 404-style WP_Error if the
	 *                       logged-in user has no linked client row.
	 */
	protected function current_client_id(): int|WP_Error {
		$client = $this->client_repository()->find_for_user( get_current_user_id() );

		if ( null === $client ) {
			return $this->error( 'merodiet_not_found', __( 'No client record is linked to this account.', 'merodiet' ), 404 );
		}

		return (int) $client['id'];
	}
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `composer test -- --filter AbstractClientControllerTest`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify with phpcs and phpstan**

Run: `vendor/bin/phpcs includes/RestApi/AbstractClientController.php && vendor/bin/phpstan analyse includes/RestApi/AbstractClientController.php && composer test`
Expected: No errors; full suite green.

- [ ] **Step 6: Commit**

```bash
git add includes/RestApi/AbstractClientController.php tests/Unit/RestApi/AbstractClientControllerTest.php
git commit -m "$(cat <<'EOF'
feat: add AbstractClientController for self-scoped client routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `ClientInviteService`

**Files:**
- Create: `includes/Clients/ClientInviteService.php`
- Test: `tests/Unit/Clients/ClientInviteServiceTest.php`

**Interfaces:**
- Consumes: `ClientRepository::find( int $id ): ?array`, `ClientRepository::set_user_id( int $client_id, int $user_id ): void` (Task 1).
- Produces: `invite( int $client_id ): true|\WP_Error` — used by `ClientsController` in Task 6.

- [ ] **Step 1: Write the failing tests**

```php
<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit\Clients;

use Brain\Monkey\Functions;
use MeroDiet\Clients\ClientInviteService;
use MeroDiet\Repositories\ClientRepository;
use MeroDiet\Tests\TestCase;
use WP_Error;

final class ClientInviteServiceTest extends TestCase {

	public function test_first_invite_creates_a_user_and_links_it(): void {
		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find' )->with( 7 )->willReturn(
			array(
				'id'      => 7,
				'user_id' => null,
				'email'   => 'client@example.test',
			)
		);

		Functions\when( 'get_user_by' )->justReturn( false );
		Functions\when( 'wp_generate_password' )->justReturn( 'irrelevant-random-password' );
		Functions\when( 'wp_insert_user' )->justReturn( 99 );
		Functions\when( 'retrieve_password' )->justReturn( true );
		Functions\when( 'sanitize_user' )->returnArg( 1 );

		$clients->expects( self::once() )
			->method( 'set_user_id' )
			->with( 7, 99 );

		$service = new ClientInviteService( $clients );

		self::assertTrue( $service->invite( 7 ) );
	}

	public function test_reinvite_of_an_already_linked_client_only_resends_the_email(): void {
		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find' )->with( 7 )->willReturn(
			array(
				'id'      => 7,
				'user_id' => 99,
				'email'   => 'client@example.test',
			)
		);

		Functions\when( 'get_user_by' )->justReturn( (object) array( 'user_login' => 'client-example-test' ) );
		Functions\when( 'retrieve_password' )->justReturn( true );

		$clients->expects( self::never() )->method( 'set_user_id' );

		$service = new ClientInviteService( $clients );

		self::assertTrue( $service->invite( 7 ) );
	}

	public function test_invite_fails_when_the_email_belongs_to_a_different_existing_user(): void {
		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find' )->with( 7 )->willReturn(
			array(
				'id'      => 7,
				'user_id' => null,
				'email'   => 'taken@example.test',
			)
		);

		Functions\when( 'get_user_by' )->justReturn( (object) array( 'ID' => 5 ) );

		$service = new ClientInviteService( $clients );

		self::assertInstanceOf( WP_Error::class, $service->invite( 7 ) );
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `composer test -- --filter ClientInviteServiceTest`
Expected: FAIL — class `MeroDiet\Clients\ClientInviteService` not found.

- [ ] **Step 3: Implement `ClientInviteService`**

```php
<?php
/**
 * Provisions a client's portal login and sends the invite.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Clients;

use MeroDiet\Repositories\ClientRepository;
use WP_Error;

/**
 * Deliberately reuses WordPress core's own password-reset flow
 * (retrieve_password()) instead of a bespoke invite-token table: core
 * already owns generating, storing, expiring, and validating that
 * token securely, and every future WP core hardening of it (rate
 * limiting, expiry tuning) applies here for free. This class's only
 * job is "make sure a WP user exists for this client, linked back to
 * their row, then let core send the email."
 */
final class ClientInviteService {

	/**
	 * @param ClientRepository $clients The client roster data access layer.
	 */
	public function __construct( private readonly ClientRepository $clients ) {}

	/**
	 * Invite a client to the portal — creates their WP user on first
	 * call, or just resends the set-password email on any call after
	 * that (idempotent re-invite; see class docblock).
	 *
	 * @param int $client_id Internal client ID.
	 */
	public function invite( int $client_id ): true|WP_Error {
		$client = $this->clients->find( $client_id );

		if ( null === $client ) {
			return new WP_Error( 'merodiet_not_found', __( 'Client not found.', 'merodiet' ), array( 'status' => 404 ) );
		}

		if ( null !== $client['user_id'] ) {
			$user = get_user_by( 'id', $client['user_id'] );

			if ( false !== $user ) {
				retrieve_password( $user->user_login );

				return true;
			}
			// The linked user was deleted out-of-band — fall through and
			// re-provision a fresh one below, same as a first invite.
		}

		$existing = get_user_by( 'email', $client['email'] );

		if ( false !== $existing ) {
			return new WP_Error(
				'merodiet_email_in_use',
				__( 'A WordPress account with this email already exists. Link or resolve it manually before inviting this client.', 'merodiet' ),
				array( 'status' => 409 )
			);
		}

		$login   = sanitize_user( current( explode( '@', $client['email'] ) ) . '-' . $client_id, true );
		$user_id = wp_insert_user(
			array(
				'user_login' => $login,
				'user_email' => $client['email'],
				'user_pass'  => wp_generate_password( 32 ),
				'role'       => 'nutrition_client',
			)
		);

		if ( is_wp_error( $user_id ) ) {
			return $user_id;
		}

		$this->clients->set_user_id( $client_id, (int) $user_id );

		$user = get_user_by( 'id', $user_id );
		retrieve_password( false !== $user ? $user->user_login : $login );

		// Fires after a client is invited to the portal.
		do_action( 'merodiet_client_invited', $client_id, $user_id );

		return true;
	}
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `composer test -- --filter ClientInviteServiceTest`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify with phpcs and phpstan**

Run: `vendor/bin/phpcs includes/Clients/ClientInviteService.php && vendor/bin/phpstan analyse includes/Clients/ClientInviteService.php && composer test`
Expected: No errors; full suite green.

- [ ] **Step 6: Commit**

```bash
git add includes/Clients/ClientInviteService.php tests/Unit/Clients/ClientInviteServiceTest.php
git commit -m "$(cat <<'EOF'
feat: add ClientInviteService for client-portal onboarding

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `POST /clients/{id}/invite` on `ClientsController`

**Files:**
- Modify: `includes/RestApi/ClientsController.php`
- Modify: `config/app.php` (wire `ClientInviteService` as a `ClientsController` constructor dependency)
- Modify: `tests/Unit/RestApi/ControllerCapabilitiesTest.php` (update `ClientsController`'s dependency list in `controller_provider()`)

**Interfaces:**
- Consumes: `ClientInviteService::invite( int $client_id ): true|WP_Error` (Task 5).

- [ ] **Step 1: Update `ControllerCapabilitiesTest`'s dependency list (this will fail until Step 3 lands)**

In `tests/Unit/RestApi/ControllerCapabilitiesTest.php`, change:

```php
			'ClientsController' => array( ClientsController::class, array( ClientRepository::class ), 'manage_merodiet_clients' ),
```

to:

```php
			'ClientsController' => array( ClientsController::class, array( ClientRepository::class, \MeroDiet\Clients\ClientInviteService::class ), 'manage_merodiet_clients' ),
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `composer test -- --filter ControllerCapabilitiesTest`
Expected: FAIL — `ClientsController`'s constructor doesn't accept a second argument yet.

- [ ] **Step 3: Add the invite route to `ClientsController`**

In `includes/RestApi/ClientsController.php`:

1. Add the import: `use MeroDiet\Clients\ClientInviteService;`
2. Change the constructor to:

```php
	public function __construct(
		private readonly ClientRepository $clients,
		private readonly ClientInviteService $invites
	) {}
```

3. Add this route registration inside `register_routes()`, after the existing `/(?P<id>\d+)` DELETABLE route:

```php
		$this->register_route(
			'/(?P<id>\d+)/invite',
			array(
				'methods'  => WP_REST_Server::CREATABLE,
				'callback' => array( $this, 'invite_client' ),
			),
			required_capability: 'manage_merodiet_clients'
		);
```

4. Add this method, after `delete_client()`:

```php
	/**
	 * POST /clients/{id}/invite — provision (or re-invite) portal access
	 * for a client owned by the current practitioner.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function invite_client( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$id     = (int) $request->get_param( 'id' );
		$client = $this->clients->find_for_practitioner( $id, $this->current_practitioner_id() );
		$owns   = $this->assert_owns( $client );

		if ( true !== $owns ) {
			return $owns;
		}

		$result = $this->invites->invite( $id );

		if ( $result instanceof WP_Error ) {
			return $result;
		}

		return $this->success( array( 'invited' => true ) );
	}
```

- [ ] **Step 4: Wire `ClientInviteService` into `config/app.php`**

In `config/app.php`, change the `ClientsController` entry to:

```php
			\MeroDiet\RestApi\ClientsController::class     => array( \MeroDiet\Repositories\ClientRepository::class, \MeroDiet\Clients\ClientInviteService::class ),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `composer test -- --filter ControllerCapabilitiesTest`
Expected: PASS.

- [ ] **Step 6: Verify with phpcs, phpstan, and the full suite**

Run: `vendor/bin/phpcs includes/RestApi/ClientsController.php config/app.php && vendor/bin/phpstan analyse includes/RestApi/ClientsController.php && composer test`
Expected: No errors; full suite green.

- [ ] **Step 7: Commit**

```bash
git add includes/RestApi/ClientsController.php config/app.php tests/Unit/RestApi/ControllerCapabilitiesTest.php
git commit -m "$(cat <<'EOF'
feat: add practitioner-initiated client-invite route

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `PlanRepository::find_active_for_client()`

**Files:**
- Modify: `includes/Repositories/PlanRepository.php`

**Interfaces:**
- Produces: `find_active_for_client( int $client_id, string $date ): ?array` — used by `MeController` in Task 8.

- [ ] **Step 1: Add the method**

Add to `includes/Repositories/PlanRepository.php`, near `find_for_practitioner()`:

```php
	/**
	 * The client's currently-active assigned plan for a given date, if
	 * any — the plan whose date range covers $date. Assumes plan date
	 * ranges for one client never overlap (a practitioner assigning a
	 * second overlapping plan is a product-level validation concern,
	 * not this query's); if that assumption is ever violated, this
	 * returns the most recently started of the overlapping plans.
	 *
	 * @param int    $client_id Client's internal ID.
	 * @param string $date      Date to check, 'Y-m-d'.
	 *
	 * @return array<string, mixed>|null
	 */
	public function find_active_for_client( int $client_id, string $date ): ?array {
		global $wpdb;

		$row = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$wpdb->prefix}merodiet_plans WHERE client_id = %d AND status = 'assigned' AND start_date <= %s AND end_date >= %s ORDER BY start_date DESC LIMIT 1", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from $wpdb->prefix, not user input; values are parameterized.
				$client_id,
				$date,
				$date
			),
			ARRAY_A
		);

		return null === $row ? null : $this->hydrate( $row );
	}
```

Note: `hydrate()` is already `private`, but this new method lives in the same class, so it can call it directly — no visibility change needed.

- [ ] **Step 2: Verify with phpcs and phpstan**

Run: `vendor/bin/phpcs includes/Repositories/PlanRepository.php && vendor/bin/phpstan analyse includes/Repositories/PlanRepository.php`
Expected: No errors.

- [ ] **Step 3: Run the full suite**

Run: `composer test`
Expected: Still green, unchanged test count.

- [ ] **Step 4: Commit**

```bash
git add includes/Repositories/PlanRepository.php
git commit -m "$(cat <<'EOF'
feat: add PlanRepository::find_active_for_client for the client portal

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `MeController` — `/me/plan`, `/me/logs`, `/me/measurements`

**Files:**
- Create: `includes/RestApi/MeController.php`
- Modify: `config/app.php` (register the controller and its dependencies)
- Modify: `tests/Unit/RestApi/ControllerCapabilitiesTest.php` (add `MeController` to `controller_provider()`)

**Interfaces:**
- Consumes: `AbstractClientController::current_client_id()` (Task 4), `LogEntryRepository` (Task 2), `MeasurementRepository` (Task 3), `PlanRepository::find_active_for_client()` (Task 7), `FoodCache::find()`, `RecipeRepository::find_for_practitioner()` (both already exist, used the same way `PlansController::with_item_details()` uses them).

- [ ] **Step 1: Update `ControllerCapabilitiesTest`'s provider (fails until Step 3 lands)**

Add this entry to `controller_provider()` in `tests/Unit/RestApi/ControllerCapabilitiesTest.php`, and add `use MeroDiet\RestApi\MeController;` plus the other new `use` statements at the top:

```php
			'MeController' => array(
				MeController::class,
				array(
					\MeroDiet\Repositories\PlanRepository::class,
					\MeroDiet\Repositories\LogEntryRepository::class,
					\MeroDiet\Repositories\MeasurementRepository::class,
					\MeroDiet\Repositories\ClientRepository::class,
					\MeroDiet\Nutrition\FoodCache::class,
					\MeroDiet\Repositories\RecipeRepository::class,
				),
				'view_own_merodiet_plan',
			),
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `composer test -- --filter ControllerCapabilitiesTest`
Expected: FAIL — class `MeroDiet\RestApi\MeController` not found.

- [ ] **Step 3: Implement `MeController`**

```php
<?php
/**
 * Client-portal "my own data" REST endpoints.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\RestApi;

use MeroDiet\Nutrition\FoodCache;
use MeroDiet\Repositories\ClientRepository;
use MeroDiet\Repositories\LogEntryRepository;
use MeroDiet\Repositories\MeasurementRepository;
use MeroDiet\Repositories\PlanRepository;
use MeroDiet\Repositories\RecipeRepository;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * Every route here requires 'view_own_merodiet_plan' and resolves the
 * caller's own client_id via AbstractClientController — see that
 * class's docblock for why there's no separate per-request ownership
 * check the way practitioner-owned resources need one.
 */
final class MeController extends AbstractClientController {

	/**
	 * Route base — registers under merodiet/v1/me.
	 *
	 * @var string
	 */
	protected string $rest_base = 'me';

	/**
	 * @param PlanRepository        $plans        Used to fetch the client's active assigned plan.
	 * @param LogEntryRepository    $logs         Used for the client's own compliance log.
	 * @param MeasurementRepository $measurements Used for the client's own measurements.
	 * @param ClientRepository      $clients      Used only to resolve current_client_id() (see AbstractClientController).
	 * @param FoodCache             $food_cache   Used to attach food detail to plan items.
	 * @param RecipeRepository      $recipes      Used to attach recipe detail to plan items.
	 */
	public function __construct(
		private readonly PlanRepository $plans,
		private readonly LogEntryRepository $logs,
		private readonly MeasurementRepository $measurements,
		private readonly ClientRepository $clients,
		private readonly FoodCache $food_cache,
		private readonly RecipeRepository $recipes
	) {}

	/**
	 * The repository AbstractClientController uses to resolve the
	 * logged-in user's own client_id.
	 */
	protected function client_repository(): ClientRepository {
		return $this->clients;
	}

	/**
	 * Register every /me/* route.
	 */
	public function register_routes(): void {
		$this->register_route(
			'/plan',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'get_plan' ),
			),
			required_capability: 'view_own_merodiet_plan'
		);

		$this->register_route(
			'/logs',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'list_logs' ),
				'args'     => array(
					'from' => array( 'type' => 'string' ),
					'to'   => array( 'type' => 'string' ),
				),
			),
			required_capability: 'view_own_merodiet_plan'
		);

		$this->register_route(
			'/logs',
			array(
				'methods'  => WP_REST_Server::CREATABLE,
				'callback' => array( $this, 'create_log' ),
				'args'     => self::log_write_args(),
			),
			required_capability: 'view_own_merodiet_plan'
		);

		$this->register_route(
			'/measurements',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'list_measurements' ),
				'args'     => array(
					'from' => array( 'type' => 'string' ),
					'to'   => array( 'type' => 'string' ),
				),
			),
			required_capability: 'view_own_merodiet_plan'
		);

		$this->register_route(
			'/measurements',
			array(
				'methods'  => WP_REST_Server::CREATABLE,
				'callback' => array( $this, 'create_measurement' ),
				'args'     => self::measurement_write_args(),
			),
			required_capability: 'view_own_merodiet_plan'
		);
	}

	/**
	 * GET /me/plan — the caller's currently active assigned plan, if any.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function get_plan( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$client_id = $this->current_client_id();

		if ( $client_id instanceof WP_Error ) {
			return $client_id;
		}

		$plan = $this->plans->find_active_for_client( $client_id, current_time( 'Y-m-d' ) );

		if ( null === $plan ) {
			return $this->success( null );
		}

		$plan['days'] = array_map(
			fn ( array $day ): array => array(
				'day_offset' => $day['day_offset'],
				'items'      => array_map(
					fn ( array $item ): array => $this->with_item_details( $item, (int) $plan['practitioner_user_id'] ),
					$this->plans->items_for_day( $day['id'] )
				),
			),
			$this->plans->days_for_plan( $plan['id'] )
		);

		return $this->success( $plan );
	}

	/**
	 * GET /me/logs — the caller's own compliance log, optionally windowed.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function list_logs( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$client_id = $this->current_client_id();

		if ( $client_id instanceof WP_Error ) {
			return $client_id;
		}

		$entries = $this->logs->all_for_client(
			$client_id,
			array(
				'from' => (string) ( $request->get_param( 'from' ) ?? '' ),
				'to'   => (string) ( $request->get_param( 'to' ) ?? '' ),
			)
		);

		return $this->success( $entries );
	}

	/**
	 * POST /me/logs — log a compliance entry for the caller. client_id
	 * is never read from the request — always the resolved caller's own.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function create_log( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$client_id = $this->current_client_id();

		if ( $client_id instanceof WP_Error ) {
			return $client_id;
		}

		$id = $this->logs->create_for_client(
			$client_id,
			array(
				'plan_item_id'   => $request->get_param( 'plan_item_id' ),
				'food_id'        => $request->get_param( 'food_id' ),
				'recipe_id'      => $request->get_param( 'recipe_id' ),
				'quantity_grams' => $request->get_param( 'quantity_grams' ),
				'servings'       => $request->get_param( 'servings' ),
				'log_date'       => (string) $request->get_param( 'log_date' ),
				'status'         => (string) $request->get_param( 'status' ),
				'notes'          => $request->get_param( 'notes' ),
			)
		);

		return $this->success( $this->logs->find( $id ), 201 );
	}

	/**
	 * GET /me/measurements — the caller's own measurements, optionally windowed.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function list_measurements( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$client_id = $this->current_client_id();

		if ( $client_id instanceof WP_Error ) {
			return $client_id;
		}

		$measurements = $this->measurements->all_for_client(
			$client_id,
			array(
				'from' => (string) ( $request->get_param( 'from' ) ?? '' ),
				'to'   => (string) ( $request->get_param( 'to' ) ?? '' ),
			)
		);

		return $this->success( $measurements );
	}

	/**
	 * POST /me/measurements — log a measurement for the caller.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function create_measurement( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$client_id = $this->current_client_id();

		if ( $client_id instanceof WP_Error ) {
			return $client_id;
		}

		$id = $this->measurements->create_for_client(
			$client_id,
			array(
				'measured_at'  => (string) $request->get_param( 'measured_at' ),
				'weight_grams' => $request->get_param( 'weight_grams' ),
				'metrics'      => (array) ( $request->get_param( 'metrics' ) ?? array() ),
				'notes'        => $request->get_param( 'notes' ),
			)
		);

		return $this->success( $this->measurements->find( $id ), 201 );
	}

	/**
	 * Attach a resolved food/recipe label to one plan item — same shape
	 * PlansController::with_item_details() attaches for the practitioner
	 * side, but scoped by the plan's OWN practitioner_user_id rather
	 * than current_practitioner_id(): the caller here is a client, not
	 * a practitioner, so there is no "current practitioner" to use, and
	 * a plan's items always belong to the same practitioner who owns
	 * the plan itself.
	 *
	 * @param array<string, mixed> $item                  Raw plan_items row.
	 * @param int                  $owning_practitioner_id The plan's own practitioner_user_id.
	 *
	 * @return array<string, mixed>
	 */
	private function with_item_details( array $item, int $owning_practitioner_id ): array {
		if ( null !== $item['food_id'] ) {
			$food                      = $this->food_cache->find( $item['food_id'] );
			$item['food_description']  = $food['description'] ?? null;
			$item['nutrients']         = $food['nutrients'] ?? array();
			$item['recipe_name']       = null;
			$item['recipe_nutrient_totals_per_serving'] = null;

			return $item;
		}

		$recipe                    = $this->recipes->find_for_practitioner( (int) $item['recipe_id'], $owning_practitioner_id );
		$item['recipe_name']       = $recipe['name'] ?? null;
		$item['recipe_nutrient_totals_per_serving'] = null;
		$item['food_description']  = null;
		$item['nutrients']         = null;

		return $item;
	}

	/**
	 * REST arg schema for POST /me/logs.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	private static function log_write_args(): array {
		return array(
			'plan_item_id'   => array( 'type' => 'integer' ),
			'food_id'        => array( 'type' => 'integer' ),
			'recipe_id'      => array( 'type' => 'integer' ),
			'quantity_grams' => array( 'type' => 'number' ),
			'servings'       => array( 'type' => 'number' ),
			'log_date'       => array(
				'required' => true,
				'type'     => 'string',
			),
			'status'         => array(
				'required' => true,
				'type'     => 'string',
				'enum'     => array( 'eaten', 'substituted', 'skipped' ),
			),
			'notes'          => array(
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_textarea_field',
			),
		);
	}

	/**
	 * REST arg schema for POST /me/measurements.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	private static function measurement_write_args(): array {
		return array(
			'measured_at'  => array(
				'required' => true,
				'type'     => 'string',
			),
			'weight_grams' => array( 'type' => 'integer' ),
			'metrics'      => array( 'type' => 'object' ),
			'notes'        => array(
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_textarea_field',
			),
		);
	}
}
```

- [ ] **Step 4: Wire `MeController` into `config/app.php`**

Add this entry to the `'controllers'` array in `config/app.php`, alongside the existing ones:

```php
			\MeroDiet\RestApi\MeController::class          => array(
				\MeroDiet\Repositories\PlanRepository::class,
				\MeroDiet\Repositories\LogEntryRepository::class,
				\MeroDiet\Repositories\MeasurementRepository::class,
				\MeroDiet\Repositories\ClientRepository::class,
				\MeroDiet\Nutrition\FoodCache::class,
				\MeroDiet\Repositories\RecipeRepository::class,
			),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `composer test -- --filter ControllerCapabilitiesTest`
Expected: PASS — `MeController`'s routes are all gated by `view_own_merodiet_plan`.

- [ ] **Step 6: Verify with phpcs, phpstan, and the full suite**

Run: `vendor/bin/phpcs includes/RestApi/MeController.php config/app.php && vendor/bin/phpstan analyse includes/RestApi/MeController.php && composer test`
Expected: No errors; full suite green.

- [ ] **Step 7: Commit**

```bash
git add includes/RestApi/MeController.php config/app.php tests/Unit/RestApi/ControllerCapabilitiesTest.php
git commit -m "$(cat <<'EOF'
feat: add MeController for client-portal plan/logs/measurements

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Final verification pass

**Files:** None changed — this task only verifies.

- [ ] **Step 1: Run the full test suite**

Run: `composer test`
Expected: All tests pass, including every test added in Tasks 1, 4, 5, 6, 8.

- [ ] **Step 2: Run phpcs and phpstan across everything touched this plan**

```bash
vendor/bin/phpcs includes/Database/QueryFilters.php includes/Repositories/ClientRepository.php includes/Repositories/LogEntryRepository.php includes/Repositories/MeasurementRepository.php includes/Repositories/PlanRepository.php includes/RestApi/AbstractClientController.php includes/RestApi/ClientsController.php includes/RestApi/MeController.php includes/Clients/ClientInviteService.php config/app.php
vendor/bin/phpstan analyse includes/
```

Expected: No errors from either.

- [ ] **Step 3: `php -l` every new/modified file**

```bash
for f in includes/Database/QueryFilters.php includes/Repositories/ClientRepository.php includes/Repositories/LogEntryRepository.php includes/Repositories/MeasurementRepository.php includes/Repositories/PlanRepository.php includes/RestApi/AbstractClientController.php includes/RestApi/ClientsController.php includes/RestApi/MeController.php includes/Clients/ClientInviteService.php config/app.php; do php -l "$f"; done
```

Expected: `No syntax errors detected` for every file.

- [ ] **Step 4: Update `JOURNEY.md` to move Phase 3 from planned to built**

Read `JOURNEY.md`, find wherever Phase 3 / client portal is listed as not-yet-built, and update it to reflect what now exists: client invite, `/me/plan`, `/me/logs`, `/me/measurements`, with an explicit note that the client-facing React screens are still a follow-up pass (per this plan's non-goals).

- [ ] **Step 5: Commit the JOURNEY.md update**

```bash
git add JOURNEY.md
git commit -m "$(cat <<'EOF'
docs: note Phase 3 client-portal backend as built

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
