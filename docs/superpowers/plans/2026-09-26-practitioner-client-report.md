# Practitioner Client Detail & Compliance Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a practitioner a per-client detail/report screen (plan, compliance %, log history, measurement history) and replace the admin Dashboard's hardcoded placeholder KPIs/compliance panel with real data.

**Architecture:** A new pure `ComplianceCalculator` class computes "% of plan items logged" for one client over a date window; both a new `ClientsController` sub-route and a new `DashboardController` reuse it. The frontend adds a `ClientDetail.tsx` screen (reusing two components extracted out of the client portal's existing `LogTab.tsx`/`MeasurementsTab.tsx`) and wires the Dashboard to the new `/dashboard/overview` endpoint.

**Tech Stack:** PHP 8.1 (league/container DI, `$wpdb`), TypeScript/React (`@wordpress/data`, `@wordpress/api-fetch`), PHPUnit + Brain Monkey.

**Spec:** `docs/superpowers/specs/2026-09-26-practitioner-client-report-design.md`

## Global Constraints

- Compliance is computed against a client's single currently-active plan intersected with the requested window — no cross-plan aggregation.
- A client with no active plan is excluded from any compliance percentage and reported as `plan: null`, never a 0%.
- No new charting library — measurement history is a list with `↑`/`↓` deltas, matching `MeasurementsTab.tsx`'s existing style exactly.
- Every new practitioner-facing route follows the existing `assert_owns()` 404-not-403 ownership pattern (`AbstractPractitionerController.php:53`) — a practitioner must never be able to fetch another practitioner's client's data, and the response must not leak whether the client ID exists at all.
- Reuse existing repository methods verbatim; only the compliance percentage itself is new logic (`LogEntryRepository::all_for_client()`, `MeasurementRepository::all_for_client()`, `PlanRepository::find_active_for_client()`/`days_for_plan()`/`items_for_day()`, `PlanRepository::all_for_practitioner()` are all unmodified).
- New controller registration is config-only: add an entry to `config/app.php`'s `'controllers'` array (see `includes/Providers/RestApiServiceProvider.php`'s docblock) — no provider code changes needed.

## Review Focus

- **A plan item logged more than once in the window (e.g. corrected from skipped to eaten) must still count once toward `logged_count`**, not once per log entry — a reasonable person reading "60% logged" would not expect that number to be inflated by a client fixing a mistake. Task 1's tests cover this explicitly.
- **A plan whose date range only partially overlaps the requested window** (e.g. plan started mid-window, or ends before the window's `to` date) must only count items from the overlapping days, not the plan's full duration — silently counting out-of-window days would make the percentage wrong without any error. Task 1's tests cover partial overlap on both edges.
- **An ad-hoc log entry (`plan_item_id = null`) must never count toward `total_count` or `logged_count`** — a client logging something not on their plan shouldn't inflate their compliance percentage. Task 1's tests cover this.
- **A practitioner requesting another practitioner's client's compliance/logs/measurements must get the same 404 (not 403, not 200 with someone else's data) as the existing `/clients/{id}` route** — a reasonable person expects every route touching a client ID to enforce ownership identically, not just the ones from the original CRUD set. Task 2's tests cover all 3 new routes.
- **The Dashboard's empty-roster case** (a brand-new practitioner with zero clients) must render zeros and an empty compliance list without a division-by-zero or a crash — a reasonable person's first launch of the plugin shouldn't error. Task 3's tests cover this.

---

### Task 1: `ComplianceCalculator` — the shared compliance calculation

**Files:**
- Create: `includes/Clients/ComplianceCalculator.php`
- Test: `tests/Unit/Clients/ComplianceCalculatorTest.php`

**Interfaces:**
- Consumes: `PlanRepository::find_active_for_client( int $client_id, string $date ): ?array` (returns the plan row, including `id`, `title`, `start_date`, `end_date`), `PlanRepository::days_for_plan( int $plan_id ): array<int, array{id:int, plan_id:int, day_offset:int}>`, `PlanRepository::items_for_day( int $plan_day_id ): array<int, array{id:int, ...}>`, `LogEntryRepository::all_for_client( int $client_id, array $filters ): array<int, array{..., plan_item_id:int|null, log_date:string, ...}>`.
- Produces: `ComplianceCalculator::calculate( int $client_id, string $from, string $to ): array{plan: array{id:int,title:string,start_date:string,end_date:string}|null, percent: int|null, logged_count: int, total_count: int, window: array{from:string,to:string}}` — used by both Task 2 (`ClientsController`) and Task 3 (`DashboardController`).

- [ ] **Step 1: Write the failing tests**

Create `tests/Unit/Clients/ComplianceCalculatorTest.php`:

```php
<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit\Clients;

use MeroDiet\Clients\ComplianceCalculator;
use MeroDiet\Repositories\LogEntryRepository;
use MeroDiet\Repositories\PlanRepository;
use MeroDiet\Tests\TestCase;

final class ComplianceCalculatorTest extends TestCase {

	private function make_calculator( PlanRepository $plans, LogEntryRepository $logs ): ComplianceCalculator {
		return new ComplianceCalculator( $plans, $logs );
	}

	public function test_no_active_plan_returns_null_plan_and_null_percent(): void {
		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'find_active_for_client' )->willReturn( null );

		$logs = $this->createMock( LogEntryRepository::class );
		$logs->expects( self::never() )->method( 'all_for_client' );

		$result = $this->make_calculator( $plans, $logs )->calculate( 7, '2026-09-01', '2026-09-07' );

		self::assertNull( $result['plan'] );
		self::assertNull( $result['percent'] );
		self::assertSame( 0, $result['logged_count'] );
		self::assertSame( 0, $result['total_count'] );
	}

	public function test_fully_logged_plan_is_100_percent(): void {
		$plan = array(
			'id'         => 3,
			'title'      => 'Week 1',
			'start_date' => '2026-09-01',
			'end_date'   => '2026-09-07',
		);

		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'find_active_for_client' )->willReturn( $plan );
		$plans->method( 'days_for_plan' )->with( 3 )->willReturn(
			array(
				array( 'id' => 10, 'plan_id' => 3, 'day_offset' => 0 ),
				array( 'id' => 11, 'plan_id' => 3, 'day_offset' => 1 ),
			)
		);
		$plans->method( 'items_for_day' )->willReturnMap(
			array(
				array( 10, array( array( 'id' => 100 ), array( 'id' => 101 ) ) ),
				array( 11, array( array( 'id' => 102 ) ) ),
			)
		);

		$logs = $this->createMock( LogEntryRepository::class );
		$logs->method( 'all_for_client' )->willReturn(
			array(
				array( 'plan_item_id' => 100, 'log_date' => '2026-09-01' ),
				array( 'plan_item_id' => 101, 'log_date' => '2026-09-01' ),
				array( 'plan_item_id' => 102, 'log_date' => '2026-09-02' ),
			)
		);

		$result = $this->make_calculator( $plans, $logs )->calculate( 7, '2026-09-01', '2026-09-07' );

		self::assertSame( $plan['id'], $result['plan']['id'] );
		self::assertSame( 3, $result['total_count'] );
		self::assertSame( 3, $result['logged_count'] );
		self::assertSame( 100, $result['percent'] );
	}

	public function test_partially_logged_plan_computes_correct_percent(): void {
		$plan = array(
			'id'         => 3,
			'title'      => 'Week 1',
			'start_date' => '2026-09-01',
			'end_date'   => '2026-09-07',
		);

		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'find_active_for_client' )->willReturn( $plan );
		$plans->method( 'days_for_plan' )->willReturn(
			array( array( 'id' => 10, 'plan_id' => 3, 'day_offset' => 0 ) )
		);
		$plans->method( 'items_for_day' )->willReturn(
			array( array( 'id' => 100 ), array( 'id' => 101 ), array( 'id' => 102 ), array( 'id' => 103 ) )
		);

		$logs = $this->createMock( LogEntryRepository::class );
		$logs->method( 'all_for_client' )->willReturn(
			array( array( 'plan_item_id' => 100, 'log_date' => '2026-09-01' ) )
		);

		$result = $this->make_calculator( $plans, $logs )->calculate( 7, '2026-09-01', '2026-09-07' );

		self::assertSame( 4, $result['total_count'] );
		self::assertSame( 1, $result['logged_count'] );
		self::assertSame( 25, $result['percent'] );
	}

	public function test_a_plan_item_logged_twice_still_counts_once(): void {
		$plan = array( 'id' => 3, 'title' => 'Week 1', 'start_date' => '2026-09-01', 'end_date' => '2026-09-07' );

		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'find_active_for_client' )->willReturn( $plan );
		$plans->method( 'days_for_plan' )->willReturn(
			array( array( 'id' => 10, 'plan_id' => 3, 'day_offset' => 0 ) )
		);
		$plans->method( 'items_for_day' )->willReturn( array( array( 'id' => 100 ) ) );

		$logs = $this->createMock( LogEntryRepository::class );
		$logs->method( 'all_for_client' )->willReturn(
			array(
				array( 'plan_item_id' => 100, 'log_date' => '2026-09-01' ),
				array( 'plan_item_id' => 100, 'log_date' => '2026-09-01' ),
			)
		);

		$result = $this->make_calculator( $plans, $logs )->calculate( 7, '2026-09-01', '2026-09-07' );

		self::assertSame( 1, $result['total_count'] );
		self::assertSame( 1, $result['logged_count'] );
		self::assertSame( 100, $result['percent'] );
	}

	public function test_ad_hoc_log_entries_are_excluded(): void {
		$plan = array( 'id' => 3, 'title' => 'Week 1', 'start_date' => '2026-09-01', 'end_date' => '2026-09-07' );

		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'find_active_for_client' )->willReturn( $plan );
		$plans->method( 'days_for_plan' )->willReturn(
			array( array( 'id' => 10, 'plan_id' => 3, 'day_offset' => 0 ) )
		);
		$plans->method( 'items_for_day' )->willReturn( array( array( 'id' => 100 ) ) );

		$logs = $this->createMock( LogEntryRepository::class );
		$logs->method( 'all_for_client' )->willReturn(
			array(
				array( 'plan_item_id' => 100, 'log_date' => '2026-09-01' ),
				array( 'plan_item_id' => null, 'log_date' => '2026-09-01' ), // ad-hoc, no plan item.
			)
		);

		$result = $this->make_calculator( $plans, $logs )->calculate( 7, '2026-09-01', '2026-09-07' );

		self::assertSame( 1, $result['total_count'] );
		self::assertSame( 1, $result['logged_count'] );
	}

	public function test_window_narrower_than_plan_only_counts_overlapping_days(): void {
		// Plan runs Sep 1-7 (day_offset 0-6); window only covers Sep 1-2
		// (day_offset 0-1) — day_offset 2's items must not be counted.
		$plan = array( 'id' => 3, 'title' => 'Week 1', 'start_date' => '2026-09-01', 'end_date' => '2026-09-07' );

		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'find_active_for_client' )->willReturn( $plan );
		$plans->method( 'days_for_plan' )->willReturn(
			array(
				array( 'id' => 10, 'plan_id' => 3, 'day_offset' => 0 ),
				array( 'id' => 11, 'plan_id' => 3, 'day_offset' => 1 ),
				array( 'id' => 12, 'plan_id' => 3, 'day_offset' => 2 ),
			)
		);
		$plans->method( 'items_for_day' )->willReturnMap(
			array(
				array( 10, array( array( 'id' => 100 ) ) ),
				array( 11, array( array( 'id' => 101 ) ) ),
				array( 12, array( array( 'id' => 999 ) ) ), // outside the window.
			)
		);

		$logs = $this->createMock( LogEntryRepository::class );
		$logs->method( 'all_for_client' )->willReturn(
			array(
				array( 'plan_item_id' => 100, 'log_date' => '2026-09-01' ),
				array( 'plan_item_id' => 101, 'log_date' => '2026-09-02' ),
			)
		);

		$result = $this->make_calculator( $plans, $logs )->calculate( 7, '2026-09-01', '2026-09-02' );

		self::assertSame( 2, $result['total_count'] );
		self::assertSame( 2, $result['logged_count'] );
		self::assertSame( 100, $result['percent'] );
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `composer test -- --filter ComplianceCalculatorTest`
Expected: FAIL — `Class "MeroDiet\Clients\ComplianceCalculator" not found`.

- [ ] **Step 3: Write the implementation**

Create `includes/Clients/ComplianceCalculator.php`:

```php
<?php
/**
 * Computes a client's plan compliance percentage over a date window.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Clients;

use DateTimeImmutable;
use MeroDiet\Repositories\LogEntryRepository;
use MeroDiet\Repositories\PlanRepository;

/**
 * "Compliance" here means: of the items scheduled on the client's
 * currently-active plan within the requested window, what fraction
 * have at least one matching log entry (any status — eaten,
 * substituted, or skipped all count as "logged", since even a skip is
 * information, not silence). Ad-hoc log entries (no plan_item_id)
 * never count — this measures plan adherence, not general app usage.
 * A plan logged more than once for the same item still counts once.
 */
final class ComplianceCalculator {

	/**
	 * Construct with the two repositories this calculation reads from.
	 *
	 * @param PlanRepository     $plans Resolves the active plan and its days/items.
	 * @param LogEntryRepository $logs  Resolves logged entries for the same client/window.
	 */
	public function __construct(
		private readonly PlanRepository $plans,
		private readonly LogEntryRepository $logs
	) {}

	/**
	 * @param int    $client_id Internal client ID.
	 * @param string $from      Window start, 'Y-m-d'.
	 * @param string $to        Window end, 'Y-m-d'.
	 *
	 * @return array{plan: array{id:int,title:string,start_date:string,end_date:string}|null, percent: int|null, logged_count: int, total_count: int, window: array{from:string,to:string}}
	 */
	public function calculate( int $client_id, string $from, string $to ): array {
		$window = array( 'from' => $from, 'to' => $to );
		$plan   = $this->plans->find_active_for_client( $client_id, $to );

		if ( null === $plan ) {
			return array(
				'plan'         => null,
				'percent'      => null,
				'logged_count' => 0,
				'total_count'  => 0,
				'window'       => $window,
			);
		}

		$plan_start = new DateTimeImmutable( (string) $plan['start_date'] );
		$window_from = new DateTimeImmutable( $from );
		$window_to   = new DateTimeImmutable( $to );

		// Every plan_item_id scheduled within the overlap of the plan's own
		// range and the requested window, mapped to its calendar date so
		// out-of-window days (Review Focus: partial overlap) are excluded.
		$item_ids_in_window = array();

		foreach ( $this->plans->days_for_plan( (int) $plan['id'] ) as $day ) {
			$day_date = $plan_start->modify( "+{$day['day_offset']} days" );

			if ( $day_date < $window_from || $day_date > $window_to ) {
				continue;
			}

			foreach ( $this->plans->items_for_day( (int) $day['id'] ) as $item ) {
				$item_ids_in_window[ (int) $item['id'] ] = true;
			}
		}

		$total_count = count( $item_ids_in_window );

		$logged_item_ids = array();

		foreach ( $this->logs->all_for_client( $client_id, $window ) as $entry ) {
			$plan_item_id = $entry['plan_item_id'] ?? null;

			// Ad-hoc entries (Review Focus) and entries for an item outside
			// this window never count.
			if ( null === $plan_item_id || ! isset( $item_ids_in_window[ (int) $plan_item_id ] ) ) {
				continue;
			}

			$logged_item_ids[ (int) $plan_item_id ] = true;
		}

		$logged_count = count( $logged_item_ids );

		return array(
			'plan'         => array(
				'id'         => (int) $plan['id'],
				'title'      => (string) $plan['title'],
				'start_date' => (string) $plan['start_date'],
				'end_date'   => (string) $plan['end_date'],
			),
			'percent'      => $total_count > 0 ? (int) round( $logged_count / $total_count * 100 ) : null,
			'logged_count' => $logged_count,
			'total_count'  => $total_count,
			'window'       => $window,
		);
	}
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `composer test -- --filter ComplianceCalculatorTest`
Expected: PASS (6/6).

- [ ] **Step 5: Register the new class for DI (no controller depends on it yet, but Tasks 2/3 will)**

No config change needed yet — `RestApiServiceProvider` only auto-binds a dependency the first time a controller lists it in `config/app.php`. Task 2 adds that entry.

- [ ] **Step 6: Run phpcs/phpstan and commit**

Run: `vendor/bin/phpcs includes/Clients/ComplianceCalculator.php tests/Unit/Clients/ComplianceCalculatorTest.php`
Expected: no errors.

Run: `vendor/bin/phpstan analyse`
Expected: no errors.

```bash
git add includes/Clients/ComplianceCalculator.php tests/Unit/Clients/ComplianceCalculatorTest.php
git commit -m "feat: add ComplianceCalculator for plan-compliance percentage"
```

---

### Task 2: `ClientsController` — logs/measurements/compliance sub-routes

**Files:**
- Modify: `includes/RestApi/ClientsController.php`
- Modify: `config/app.php:38` (add 3 new constructor dependencies to `ClientsController`'s entry)
- Test: `tests/Unit/RestApi/ClientsControllerComplianceTest.php`

**Interfaces:**
- Consumes: `ComplianceCalculator::calculate()` (Task 1), `LogEntryRepository::all_for_client()`, `MeasurementRepository::all_for_client()`, `AbstractPractitionerController::assert_owns()` (existing), `ClientRepository::find_for_practitioner()` (existing).
- Produces: `GET /clients/{id}/logs?from=&to=`, `GET /clients/{id}/measurements?from=&to=`, `GET /clients/{id}/compliance?from=&to=` — all requiring `manage_merodiet_clients` and per-client ownership. Task 5 (frontend) calls these three routes by these exact paths.

- [ ] **Step 1: Write the failing test**

Create `tests/Unit/RestApi/ClientsControllerComplianceTest.php`:

```php
<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit\RestApi;

use MeroDiet\Clients\ClientInviteService;
use MeroDiet\Clients\ComplianceCalculator;
use MeroDiet\Repositories\ClientRepository;
use MeroDiet\Repositories\LogEntryRepository;
use MeroDiet\Repositories\MeasurementRepository;
use MeroDiet\RestApi\ClientsController;
use MeroDiet\Tests\TestCase;
use WP_REST_Request;

/**
 * Proves the new per-client report routes enforce the same
 * ownership check as every other owned resource — a practitioner
 * fetching another practitioner's client gets a 404, identically to
 * the existing GET /clients/{id} route, never the data itself.
 */
final class ClientsControllerComplianceTest extends TestCase {

	private function make_controller(
		ClientRepository $clients,
		?LogEntryRepository $logs = null,
		?MeasurementRepository $measurements = null,
		?ComplianceCalculator $compliance = null
	): ClientsController {
		return new ClientsController(
			$clients,
			$this->createMock( ClientInviteService::class ),
			$logs ?? $this->createMock( LogEntryRepository::class ),
			$measurements ?? $this->createMock( MeasurementRepository::class ),
			$compliance ?? $this->createMock( ComplianceCalculator::class )
		);
	}

	public function test_get_logs_returns_404_for_another_practitioners_client(): void {
		\Brain\Monkey\Functions\when( 'get_current_user_id' )->justReturn( 42 );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_practitioner' )->with( 7, 42 )->willReturn( null );

		$request = new WP_REST_Request();
		$request->set_param( 'id', 7 );

		$result = $this->make_controller( $clients )->get_client_logs( $request );

		self::assertInstanceOf( \WP_Error::class, $result );
		self::assertSame( 404, $result->get_error_data()['status'] );
	}

	public function test_get_measurements_returns_404_for_another_practitioners_client(): void {
		\Brain\Monkey\Functions\when( 'get_current_user_id' )->justReturn( 42 );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_practitioner' )->with( 7, 42 )->willReturn( null );

		$request = new WP_REST_Request();
		$request->set_param( 'id', 7 );

		$result = $this->make_controller( $clients )->get_client_measurements( $request );

		self::assertInstanceOf( \WP_Error::class, $result );
		self::assertSame( 404, $result->get_error_data()['status'] );
	}

	public function test_get_compliance_returns_404_for_another_practitioners_client(): void {
		\Brain\Monkey\Functions\when( 'get_current_user_id' )->justReturn( 42 );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_practitioner' )->with( 7, 42 )->willReturn( null );

		$request = new WP_REST_Request();
		$request->set_param( 'id', 7 );

		$result = $this->make_controller( $clients )->get_client_compliance( $request );

		self::assertInstanceOf( \WP_Error::class, $result );
		self::assertSame( 404, $result->get_error_data()['status'] );
	}

	public function test_get_compliance_calls_calculator_with_resolved_client_and_window(): void {
		\Brain\Monkey\Functions\when( 'get_current_user_id' )->justReturn( 42 );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_practitioner' )->with( 7, 42 )->willReturn(
			array( 'id' => 7, 'practitioner_user_id' => 42 )
		);

		$compliance = $this->createMock( ComplianceCalculator::class );
		$compliance->expects( self::once() )
			->method( 'calculate' )
			->with( 7, '2026-09-01', '2026-09-07' )
			->willReturn(
				array(
					'plan'         => null,
					'percent'      => null,
					'logged_count' => 0,
					'total_count'  => 0,
					'window'       => array( 'from' => '2026-09-01', 'to' => '2026-09-07' ),
				)
			);

		$request = new WP_REST_Request();
		$request->set_param( 'id', 7 );
		$request->set_param( 'from', '2026-09-01' );
		$request->set_param( 'to', '2026-09-07' );

		$this->make_controller( $clients, null, null, $compliance )->get_client_compliance( $request );
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `composer test -- --filter ClientsControllerComplianceTest`
Expected: FAIL — `ClientsController::__construct()` doesn't accept 5 arguments yet (`Too few arguments to function` or similar), and `get_client_logs`/`get_client_measurements`/`get_client_compliance` don't exist.

- [ ] **Step 3: Update `ClientsController`'s constructor and add the 3 routes**

Modify `includes/RestApi/ClientsController.php`. First, the constructor and imports (replace the existing constructor block):

```php
use MeroDiet\Clients\ClientInviteService;
use MeroDiet\Clients\ComplianceCalculator;
use MeroDiet\Repositories\ClientRepository;
use MeroDiet\Repositories\LogEntryRepository;
use MeroDiet\Repositories\MeasurementRepository;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

// ... class ClientsController extends AbstractPractitionerController { ... (unchanged docblock/rest_base/LIST_FILTERS)

	/**
	 * Construct with the repository/service/calculator this controller uses.
	 *
	 * @param ClientRepository      $clients      The client roster data access layer.
	 * @param ClientInviteService   $invites      The client invite provisioning service.
	 * @param LogEntryRepository    $logs         A client's compliance log entries.
	 * @param MeasurementRepository $measurements A client's weight/measurement entries.
	 * @param ComplianceCalculator  $compliance   Computes a client's plan-compliance percentage.
	 */
	public function __construct(
		private readonly ClientRepository $clients,
		private readonly ClientInviteService $invites,
		private readonly LogEntryRepository $logs,
		private readonly MeasurementRepository $measurements,
		private readonly ComplianceCalculator $compliance
	) {}
```

Then, inside `register_routes()`, after the existing `/invite` route registration, add:

```php
		$this->register_route(
			'/(?P<id>\d+)/logs',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'get_client_logs' ),
				'args'     => array(
					'from' => array( 'type' => 'string', 'format' => 'date' ),
					'to'   => array( 'type' => 'string', 'format' => 'date' ),
				),
			),
			required_capability: 'manage_merodiet_clients'
		);

		$this->register_route(
			'/(?P<id>\d+)/measurements',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'get_client_measurements' ),
				'args'     => array(
					'from' => array( 'type' => 'string', 'format' => 'date' ),
					'to'   => array( 'type' => 'string', 'format' => 'date' ),
				),
			),
			required_capability: 'manage_merodiet_clients'
		);

		$this->register_route(
			'/(?P<id>\d+)/compliance',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'get_client_compliance' ),
				'args'     => array(
					'from' => array( 'type' => 'string', 'format' => 'date' ),
					'to'   => array( 'type' => 'string', 'format' => 'date' ),
				),
			),
			required_capability: 'manage_merodiet_clients'
		);
```

Then add the 3 handlers (near `invite_client()`):

```php
	/**
	 * GET /clients/{id}/logs — a client's own compliance log, from the
	 * practitioner's side.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function get_client_logs( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$client = $this->clients->find_for_practitioner( (int) $request->get_param( 'id' ), $this->current_practitioner_id() );
		$owns   = $this->assert_owns( $client );

		if ( true !== $owns ) {
			return $owns;
		}

		$entries = $this->logs->all_for_client(
			(int) $client['id'],
			array(
				'from' => (string) ( $request->get_param( 'from' ) ?? '' ),
				'to'   => (string) ( $request->get_param( 'to' ) ?? '' ),
			)
		);

		return $this->success( $entries );
	}

	/**
	 * GET /clients/{id}/measurements — a client's own measurements, from
	 * the practitioner's side.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function get_client_measurements( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$client = $this->clients->find_for_practitioner( (int) $request->get_param( 'id' ), $this->current_practitioner_id() );
		$owns   = $this->assert_owns( $client );

		if ( true !== $owns ) {
			return $owns;
		}

		$entries = $this->measurements->all_for_client(
			(int) $client['id'],
			array(
				'from' => (string) ( $request->get_param( 'from' ) ?? '' ),
				'to'   => (string) ( $request->get_param( 'to' ) ?? '' ),
			)
		);

		return $this->success( $entries );
	}

	/**
	 * GET /clients/{id}/compliance — the client's plan-compliance
	 * percentage over the requested window (defaults handled by
	 * ComplianceCalculator's caller — see get_client_compliance's own
	 * args schema for the 'from'/'to' date format).
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function get_client_compliance( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$client = $this->clients->find_for_practitioner( (int) $request->get_param( 'id' ), $this->current_practitioner_id() );
		$owns   = $this->assert_owns( $client );

		if ( true !== $owns ) {
			return $owns;
		}

		$result = $this->compliance->calculate(
			(int) $client['id'],
			(string) ( $request->get_param( 'from' ) ?? '' ),
			(string) ( $request->get_param( 'to' ) ?? '' )
		);

		return $this->success( $result );
	}
```

- [ ] **Step 4: Update `config/app.php`'s `ClientsController` entry**

Modify `config/app.php:38`:

```php
			\MeroDiet\RestApi\ClientsController::class     => array(
				\MeroDiet\Repositories\ClientRepository::class,
				\MeroDiet\Clients\ClientInviteService::class,
				\MeroDiet\Repositories\LogEntryRepository::class,
				\MeroDiet\Repositories\MeasurementRepository::class,
				\MeroDiet\Clients\ComplianceCalculator::class,
			),
```

`ComplianceCalculator` itself isn't listed anywhere else in `config/app.php` yet — `RestApiServiceProvider` auto-binds any dependency class not already in the container (see its docblock), so this alone is sufficient; it will construct `ComplianceCalculator` with `PlanRepository`/`LogEntryRepository` auto-bound the same way.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `composer test -- --filter ClientsController`
Expected: PASS (all `ClientsControllerComplianceTest` cases; also re-run the full suite once to confirm nothing about the constructor change broke any other `ClientsController` usage — `composer test`).

- [ ] **Step 6: Verify live against wp-env**

Start `wp-env` if not running (`npx wp-env start`), log in as the seeded admin, and confirm via the browser's network tab (or `curl` with a valid nonce) that `GET /wp-json/merodiet/v1/clients/{a-real-client-id}/compliance` returns the expected shape. If no client has an assigned plan yet, create one via the existing Plan Builder UI first so `plan` is non-null in at least one manual check.

- [ ] **Step 7: Run phpcs/phpstan and commit**

Run: `vendor/bin/phpcs includes/RestApi/ClientsController.php config/app.php tests/Unit/RestApi/ClientsControllerComplianceTest.php`
Expected: no errors.

Run: `vendor/bin/phpstan analyse`
Expected: no errors.

```bash
git add includes/RestApi/ClientsController.php config/app.php tests/Unit/RestApi/ClientsControllerComplianceTest.php
git commit -m "feat: add per-client logs/measurements/compliance routes"
```

---

### Task 3: `DashboardController` — the roster-wide overview endpoint

**Files:**
- Create: `includes/RestApi/DashboardController.php`
- Modify: `config/app.php` (add `DashboardController` entry)
- Test: `tests/Unit/RestApi/DashboardControllerTest.php`

**Interfaces:**
- Consumes: `ComplianceCalculator::calculate()` (Task 1), `ClientRepository::all_for_practitioner( int $practitioner_user_id, int $page, int $per_page, array $filters ): array{items, total}` (existing — used with `$filters = ['status' => 'active']` and a large `$per_page` to fetch the whole active roster in one call, matching this plugin's target scale of tens of clients per practitioner per the spec's stated non-goal on pagination), `PlanRepository::find_active_for_client()`, `PlanRepository::all_for_practitioner()` (existing, filtered `status: 'draft'`).
- Produces: `GET /dashboard/overview` → `array{active_client_count:int, clients_without_plan_count:int, logged_today_count:int, draft_plan_count:int, compliance: array<int, array{client_id:int, name:string, percent:int}>}`. Task 6 (frontend) consumes this exact shape.

- [ ] **Step 1: Write the failing test**

Create `tests/Unit/RestApi/DashboardControllerTest.php`:

```php
<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit\RestApi;

use MeroDiet\Clients\ComplianceCalculator;
use MeroDiet\Repositories\ClientRepository;
use MeroDiet\Repositories\PlanRepository;
use MeroDiet\RestApi\DashboardController;
use MeroDiet\Tests\TestCase;
use WP_REST_Request;

final class DashboardControllerTest extends TestCase {

	public function test_empty_roster_returns_all_zeros_and_empty_compliance(): void {
		\Brain\Monkey\Functions\when( 'get_current_user_id' )->justReturn( 42 );
		\Brain\Monkey\Functions\when( 'current_time' )->alias( static fn () => '2026-09-26' );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'all_for_practitioner' )->willReturn( array( 'items' => array(), 'total' => 0 ) );

		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'all_for_practitioner' )->willReturn( array( 'items' => array(), 'total' => 0 ) );

		$compliance = $this->createMock( ComplianceCalculator::class );
		$compliance->expects( self::never() )->method( 'calculate' );

		$controller = new DashboardController( $clients, $plans, $compliance );

		$response = $controller->get_overview( new WP_REST_Request() );
		$data     = $response->get_data();

		self::assertSame( 0, $data['active_client_count'] );
		self::assertSame( 0, $data['clients_without_plan_count'] );
		self::assertSame( 0, $data['logged_today_count'] );
		self::assertSame( 0, $data['draft_plan_count'] );
		self::assertSame( array(), $data['compliance'] );
	}

	public function test_mixed_roster_sorts_compliance_worst_first_and_excludes_no_plan_clients(): void {
		\Brain\Monkey\Functions\when( 'get_current_user_id' )->justReturn( 42 );
		\Brain\Monkey\Functions\when( 'current_time' )->alias( static fn () => '2026-09-26' );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'all_for_practitioner' )->willReturn(
			array(
				'items' => array(
					array( 'id' => 1, 'first_name' => 'A', 'last_name' => 'One' ),
					array( 'id' => 2, 'first_name' => 'B', 'last_name' => 'Two' ),
					array( 'id' => 3, 'first_name' => 'C', 'last_name' => 'Three' ), // no plan.
				),
				'total' => 3,
			)
		);

		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'all_for_practitioner' )->willReturn( array( 'items' => array(), 'total' => 0 ) );

		$compliance = $this->createMock( ComplianceCalculator::class );
		$compliance->method( 'calculate' )->willReturnMap(
			array(
				array( 1, '2026-09-20', '2026-09-26', array( 'plan' => array( 'id' => 10 ), 'percent' => 80, 'logged_count' => 4, 'total_count' => 5, 'window' => array() ) ),
				array( 2, '2026-09-20', '2026-09-26', array( 'plan' => array( 'id' => 11 ), 'percent' => 20, 'logged_count' => 1, 'total_count' => 5, 'window' => array() ) ),
				array( 3, '2026-09-20', '2026-09-26', array( 'plan' => null, 'percent' => null, 'logged_count' => 0, 'total_count' => 0, 'window' => array() ) ),
			)
		);

		$controller = new DashboardController( $clients, $plans, $compliance );

		$response = $controller->get_overview( new WP_REST_Request() );
		$data     = $response->get_data();

		self::assertSame( 1, $data['clients_without_plan_count'] );
		self::assertCount( 2, $data['compliance'] );
		self::assertSame( 2, $data['compliance'][0]['client_id'] ); // 20% first (worst).
		self::assertSame( 1, $data['compliance'][1]['client_id'] ); // 80% second.
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `composer test -- --filter DashboardControllerTest`
Expected: FAIL — `Class "MeroDiet\RestApi\DashboardController" not found`.

- [ ] **Step 3: Write `DashboardController`**

Create `includes/RestApi/DashboardController.php`:

```php
<?php
/**
 * Practitioner dashboard REST endpoint.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\RestApi;

use MeroDiet\Clients\ComplianceCalculator;
use MeroDiet\Repositories\ClientRepository;
use MeroDiet\Repositories\PlanRepository;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * A single read-only endpoint aggregating everything the admin
 * Dashboard screen needs, so it isn't N+1 round trips. Scoped
 * implicitly to the current practitioner — no {id} param, unlike
 * ClientsController's per-client routes.
 */
final class DashboardController extends AbstractPractitionerController {

	/**
	 * Route base — registers under merodiet/v1/dashboard.
	 *
	 * @var string
	 */
	protected string $rest_base = 'dashboard';

	/**
	 * Compliance window, in days, for both "logged today" and the
	 * roster-wide compliance list.
	 */
	private const COMPLIANCE_WINDOW_DAYS = 7;

	/**
	 * Construct with the repositories/calculator this endpoint reads from.
	 *
	 * @param ClientRepository     $clients    The practitioner's client roster.
	 * @param PlanRepository       $plans      Used for the draft-plan count and each client's active plan.
	 * @param ComplianceCalculator $compliance Computes each client's plan-compliance percentage.
	 */
	public function __construct(
		private readonly ClientRepository $clients,
		private readonly PlanRepository $plans,
		private readonly ComplianceCalculator $compliance
	) {}

	/**
	 * Register the single overview route.
	 */
	public function register_routes(): void {
		$this->register_route(
			'/overview',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'get_overview' ),
			),
			required_capability: 'manage_merodiet_clients'
		);
	}

	/**
	 * GET /dashboard/overview.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function get_overview( WP_REST_Request $request ): WP_REST_Response {
		$practitioner_id = $this->current_practitioner_id();
		$today           = current_time( 'Y-m-d' );
		$window_from     = gmdate( 'Y-m-d', strtotime( "{$today} -" . ( self::COMPLIANCE_WINDOW_DAYS - 1 ) . ' days' ) );

		$roster = $this->clients->all_for_practitioner( $practitioner_id, 1, 10000, array( 'status' => 'active' ) );

		$clients_without_plan_count = 0;
		$logged_today_count         = 0;
		$compliance_rows            = array();

		foreach ( $roster['items'] as $client ) {
			$result = $this->compliance->calculate( (int) $client['id'], $window_from, $today );

			if ( null === $result['plan'] ) {
				++$clients_without_plan_count;
				continue;
			}

			if ( $result['logged_count'] > 0 ) {
				++$logged_today_count;
			}

			$compliance_rows[] = array(
				'client_id' => (int) $client['id'],
				'name'      => trim( ( $client['first_name'] ?? '' ) . ' ' . ( $client['last_name'] ?? '' ) ),
				'percent'   => (int) $result['percent'],
			);
		}

		usort( $compliance_rows, static fn ( array $a, array $b ) => $a['percent'] <=> $b['percent'] );

		$draft_plans = $this->plans->all_for_practitioner( $practitioner_id, 1, 1, array( 'status' => 'draft' ) );

		return $this->success(
			array(
				'active_client_count'        => (int) $roster['total'],
				'clients_without_plan_count' => $clients_without_plan_count,
				'logged_today_count'         => $logged_today_count,
				'draft_plan_count'           => (int) $draft_plans['total'],
				'compliance'                 => $compliance_rows,
			)
		);
	}
}
```

- [ ] **Step 4: Register in `config/app.php`**

Add to the `'controllers'` array:

```php
			\MeroDiet\RestApi\DashboardController::class   => array(
				\MeroDiet\Repositories\ClientRepository::class,
				\MeroDiet\Repositories\PlanRepository::class,
				\MeroDiet\Clients\ComplianceCalculator::class,
			),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `composer test -- --filter DashboardControllerTest`
Expected: PASS (2/2).

- [ ] **Step 6: Verify live against wp-env**

With wp-env running and at least 2-3 clients seeded (some with an assigned plan, some without), confirm `GET /wp-json/merodiet/v1/dashboard/overview` returns real, correctly-shaped data — check `clients_without_plan_count` matches the clients you left unassigned.

- [ ] **Step 7: Run phpcs/phpstan and commit**

Run: `vendor/bin/phpcs includes/RestApi/DashboardController.php config/app.php tests/Unit/RestApi/DashboardControllerTest.php`
Expected: no errors.

Run: `vendor/bin/phpstan analyse`
Expected: no errors.

```bash
git add includes/RestApi/DashboardController.php config/app.php tests/Unit/RestApi/DashboardControllerTest.php
git commit -m "feat: add /dashboard/overview endpoint"
```

---

### Task 4: Extract shared log-history and measurement-history components

**Files:**
- Create: `src/components/clients/LogHistoryList.tsx`
- Create: `src/components/clients/LogHistoryList.module.css`
- Create: `src/components/clients/MeasurementHistoryList.tsx`
- Create: `src/components/clients/MeasurementHistoryList.module.css`
- Modify: `src/client-portal/LogTab.tsx` (use the extracted component instead of its own inline history rendering)
- Modify: `src/client-portal/MeasurementsTab.tsx` (same)

**Interfaces:**
- Consumes: `LogEntry`, `Measurement` types from `src/types.ts` (existing); `formatDate` from `src/utils/date` (existing); `gramsToDisplay`, `WeightUnit` from `src/utils/weight` (existing, for `MeasurementHistoryList`).
- Produces: `LogHistoryList( { entriesByDate: Record<string, LogEntry[]> } ): JSX.Element` and `MeasurementHistoryList( { measurements: Measurement[], unit: WeightUnit } ): JSX.Element` — Task 5's `ClientDetail.tsx` imports both.

This task is a refactor with no new behavior — the acceptance bar is that `LogTab.tsx`/`MeasurementsTab.tsx` render **identically** before and after, confirmed via the browser, not new automated tests (there are no existing snapshot/rendering tests for these components to extend; a behavior-preserving extraction is verified by manual comparison, per this plan's Testing section in the spec).

- [ ] **Step 1: Read the current history-rendering code to extract**

Read `src/client-portal/LogTab.tsx`, locating its "Recent history" section (the block iterating `historyByDate`/`pastDates`, rendering each date's entries with status/notes). Read `src/client-portal/MeasurementsTab.tsx`, locating its history `<ul>` block (rendering each measurement with its computed delta).

- [ ] **Step 2: Create `LogHistoryList.tsx`**

Move the JSX/logic for rendering one date's group of log entries (status badges, substitution notes) into:

```tsx
import { __ } from '@wordpress/i18n';
import { formatDate } from '../../utils/date';
import type { LogEntry } from '../../types';
import styles from './LogHistoryList.module.css';

interface LogHistoryListProps {
	entriesByDate: Record< string, LogEntry[] >;
}

// Extracted from client-portal/LogTab.tsx's "Recent history" section so
// the practitioner-facing ClientDetail screen can render the identical
// history view without a second, near-identical copy of this logic.
export default function LogHistoryList( { entriesByDate }: LogHistoryListProps ) {
	const dates = Object.keys( entriesByDate ).sort( ( a, b ) => b.localeCompare( a ) );

	if ( 0 === dates.length ) {
		return (
			<p className={ styles.empty }>
				{ __( 'No history in this range.', 'merodiet' ) }
			</p>
		);
	}

	return (
		<ul className={ styles.historyList }>
			{ dates.map( ( date ) => (
				<li key={ date } className={ styles.dateGroup }>
					<div className={ styles.dateHeading }>{ formatDate( date ) }</div>
					<ul className={ styles.entryList }>
						{ entriesByDate[ date ].map( ( entry ) => (
							<li key={ entry.id } className={ styles.entry }>
								<span
									className={ `${ styles.statusBadge } ${
										styles[ entry.status ] ?? ''
									}`.trim() }
								>
									{ entry.status }
								</span>
								{ entry.notes && (
									<span className={ styles.notes }>
										{ entry.notes }
									</span>
								) }
							</li>
						) ) }
					</ul>
				</li>
			) ) }
		</ul>
	);
}
```

Create `LogHistoryList.module.css` by copying the relevant `.historyList`/`.dateGroup`/`.entry`/`.statusBadge`/`.notes`-equivalent rules straight out of `LogTab.module.css` (whatever the actual existing class names are once you've read Step 1's file — match them exactly so the visual output is unchanged; do not invent new styling).

- [ ] **Step 3: Update `LogTab.tsx` to use it**

Replace the inline "Recent history" JSX block with:

```tsx
import LogHistoryList from '../components/clients/LogHistoryList';
// ...
<LogHistoryList entriesByDate={ historyByDate } />
```

removing the now-dead inline rendering code (but keeping `historyByDate`'s own computation in `LogTab.tsx` — only the rendering moved, not the data-shaping).

- [ ] **Step 4: Create `MeasurementHistoryList.tsx`**

Same extraction for `MeasurementsTab.tsx`'s history list:

```tsx
import { formatDate } from '../../utils/date';
import { gramsToDisplay, type WeightUnit } from '../../utils/weight';
import type { Measurement } from '../../types';
import styles from './MeasurementHistoryList.module.css';

interface MeasurementHistoryListProps {
	measurements: Measurement[];
	unit: WeightUnit;
}

// Extracted from client-portal/MeasurementsTab.tsx's history <ul> so the
// practitioner-facing ClientDetail screen can render the identical
// delta-annotated history view without duplicating this logic.
export default function MeasurementHistoryList( {
	measurements,
	unit,
}: MeasurementHistoryListProps ) {
	return (
		<ul className={ styles.historyList }>
			{ measurements.map( ( measurement, index ) => {
				const prevWeighed = measurements
					.slice( index + 1 )
					.find( ( m ) => null !== m.weight_grams );
				const delta =
					null !== measurement.weight_grams &&
					prevWeighed &&
					null !== prevWeighed.weight_grams
						? Math.round(
								( gramsToDisplay( measurement.weight_grams, unit ) -
									gramsToDisplay( prevWeighed.weight_grams, unit ) ) *
									10
						  ) / 10
						: null;

				return (
					<li key={ measurement.id } className={ styles.historyItem }>
						<div className={ styles.historyRow }>
							<span>{ formatDate( measurement.measured_at ) }</span>
							<div className={ styles.historyWeight }>
								<span>
									{ null !== measurement.weight_grams
										? `${ gramsToDisplay(
												measurement.weight_grams,
												unit
										  ) } ${ unit }`
										: '—' }
								</span>
								{ null !== delta && 0 !== delta && (
									<span className={ styles.historyDelta }>
										{ delta > 0 ? '↑' : '↓' } { Math.abs( delta ) }{ ' ' }
										{ unit }
									</span>
								) }
							</div>
						</div>
						{ measurement.notes && (
							<div className={ styles.historyNote }>
								{ measurement.notes }
							</div>
						) }
					</li>
				);
			} ) }
		</ul>
	);
}
```

Create `MeasurementHistoryList.module.css` by copying the equivalent rules from `MeasurementsTab.module.css` verbatim.

- [ ] **Step 5: Update `MeasurementsTab.tsx` to use it**

Replace its inline history `<ul>` with:

```tsx
import MeasurementHistoryList from '../components/clients/MeasurementHistoryList';
// ...
<MeasurementHistoryList measurements={ measurements } unit={ unit } />
```

- [ ] **Step 6: Verify no visual regression**

Start the dev server (or point wp-env at a build), log in to the client portal as the seeded test client, open the Log tab and the Measurements tab, and confirm both render identically to before this task (same history rows, same deltas, same "load more" behavior — unaffected, since that logic wasn't touched).

- [ ] **Step 7: Run type-check/lint and commit**

Run: `npm run check-types && npm run lint:js`
Expected: no errors.

```bash
git add src/components/clients/LogHistoryList.tsx src/components/clients/LogHistoryList.module.css src/components/clients/MeasurementHistoryList.tsx src/components/clients/MeasurementHistoryList.module.css src/client-portal/LogTab.tsx src/client-portal/MeasurementsTab.tsx
git commit -m "refactor: extract LogHistoryList/MeasurementHistoryList for reuse"
```

---

### Task 5: `ClientDetail.tsx` screen and roster navigation

**Files:**
- Create: `src/screens/clients/ClientDetail.tsx`
- Create: `src/screens/clients/ClientDetail.module.css`
- Modify: `src/screens/clients/ClientRoster.tsx` (row click navigates to detail instead of opening the edit modal directly)

**Interfaces:**
- Consumes: `LogHistoryList`, `MeasurementHistoryList` (Task 4); `GET /clients/{id}/logs`, `/measurements`, `/compliance` (Task 2); the existing `ClientForm`/edit-modal component (unchanged, just reused from this new screen instead of the roster).
- Produces: the `?view=clients&id={id}` route, reachable from the roster.

- [ ] **Step 1: Read `ClientRoster.tsx`'s current row-click and edit-modal wiring**

Read `src/screens/clients/ClientRoster.tsx` fully to find exactly how a row's edit action currently opens (state variable name, modal component name) — Step 3 needs to change this precisely, not guess at names.

- [ ] **Step 2: Create `ClientDetail.tsx`**

```tsx
import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import Panel, { PanelBody } from '../../components/ui/Panel';
import Skeleton from '../../components/ui/Skeleton';
import LogHistoryList from '../../components/clients/LogHistoryList';
import MeasurementHistoryList from '../../components/clients/MeasurementHistoryList';
import { readStoredWeightUnit } from '../../utils/weight';
import { useQueryParam } from '../../hooks/useQueryParam';
import type { Client, LogEntry, Measurement } from '../../types';
import styles from './ClientDetail.module.css';

interface ComplianceResult {
	plan: { id: number; title: string; start_date: string; end_date: string } | null;
	percent: number | null;
	logged_count: number;
	total_count: number;
}

const HISTORY_DAYS = 30;

function daysAgo( days: number ): string {
	const date = new Date();
	date.setDate( date.getDate() - days );
	return date.toISOString().slice( 0, 10 );
}

export default function ClientDetail() {
	const [ , setViewParam ] = useQueryParam( 'view' );
	const [ idParam ] = useQueryParam( 'id' );
	const clientId = Number( idParam );
	const unit = readStoredWeightUnit();

	const [ client, setClient ] = useState< Client | null | undefined >( undefined );
	const [ compliance, setCompliance ] = useState< ComplianceResult | undefined >(
		undefined
	);
	const [ logs, setLogs ] = useState< LogEntry[] | undefined >( undefined );
	const [ measurements, setMeasurements ] = useState< Measurement[] | undefined >(
		undefined
	);

	const today = new Date().toISOString().slice( 0, 10 );

	useEffect( () => {
		apiFetch< Client >( { path: `/merodiet/v1/clients/${ clientId }` } ).then(
			setClient,
			() => setClient( null )
		);
		apiFetch< ComplianceResult >( {
			path: `/merodiet/v1/clients/${ clientId }/compliance?from=${ daysAgo( 6 ) }&to=${ today }`,
		} ).then( setCompliance, () => setCompliance( undefined ) );
		apiFetch< LogEntry[] >( {
			path: `/merodiet/v1/clients/${ clientId }/logs?from=${ daysAgo(
				HISTORY_DAYS - 1
			) }&to=${ today }`,
		} ).then( setLogs, () => setLogs( [] ) );
		apiFetch< Measurement[] >( {
			path: `/merodiet/v1/clients/${ clientId }/measurements?from=${ daysAgo(
				HISTORY_DAYS - 1
			) }&to=${ today }`,
		} ).then( setMeasurements, () => setMeasurements( [] ) );
		// eslint-disable-next-line react-hooks/exhaustive-deps -- clientId/today are stable for the component's lifetime.
	}, [] );

	const isLoading = undefined === client || undefined === logs || undefined === measurements;

	const logsByDate: Record< string, LogEntry[] > = {};
	for ( const entry of logs ?? [] ) {
		( logsByDate[ entry.log_date ] ??= [] ).push( entry );
	}

	return (
		<>
			<div className="merodiet-topbar">
				<div>
					<button
						type="button"
						className={ styles.backLink }
						onClick={ () => setViewParam( 'clients' ) }
					>
						{ __( '← Back to roster', 'merodiet' ) }
					</button>
					<h1>
						{ client
							? `${ client.first_name } ${ client.last_name }`
							: __( 'Client', 'merodiet' ) }
					</h1>
				</div>
			</div>

			{ isLoading && (
				<div>
					<Skeleton width="60%" height="20px" />
					<Skeleton width="40%" height="16px" />
				</div>
			) }

			{ ! isLoading && (
				<>
					<Panel>
						<PanelBody>
							<h3 className={ styles.sectionTitle }>
								{ __( 'Compliance', 'merodiet' ) }
							</h3>
							{ compliance && null === compliance.plan && (
								<p className={ styles.empty }>
									{ __( 'No active plan assigned.', 'merodiet' ) }
								</p>
							) }
							{ compliance && compliance.plan && (
								<div className="merodiet-kpi">
									<div className="merodiet-kpi-label">
										{ compliance.plan.title }
									</div>
									<div className="merodiet-kpi-value">
										{ compliance.percent }%
									</div>
									<div className="merodiet-kpi-delta">
										{ compliance.logged_count } / { compliance.total_count }{ ' ' }
										{ __( 'items logged', 'merodiet' ) }
									</div>
								</div>
							) }
						</PanelBody>
					</Panel>

					<Panel>
						<PanelBody>
							<h3 className={ styles.sectionTitle }>
								{ __( 'Log history', 'merodiet' ) }
							</h3>
							<LogHistoryList entriesByDate={ logsByDate } />
						</PanelBody>
					</Panel>

					<Panel>
						<PanelBody>
							<h3 className={ styles.sectionTitle }>
								{ __( 'Measurements', 'merodiet' ) }
							</h3>
							<MeasurementHistoryList
								measurements={ measurements ?? [] }
								unit={ unit }
							/>
						</PanelBody>
					</Panel>
				</>
			) }
		</>
	);
}
```

Create `ClientDetail.module.css` with `.backLink` (small text-link button style, matching the load-more link style already established elsewhere — `background: none; border: none; padding: 4px 0; font-size: 13px; color: var(--sage); cursor: pointer;`), `.sectionTitle` (`font-size: 15px; margin: 0 0 14px;`), `.empty` (`color: var(--ink-muted);`).

- [ ] **Step 3: Wire it into `ClientRoster.tsx` and `App.tsx`**

In `src/admin/App.tsx`, `VIEWS` already maps view IDs to components (`clients: { render: () => <ClientRoster /> }`, per its existing structure) — `ClientDetail` isn't a new top-level view; instead, `ClientRoster.tsx` itself should conditionally render `ClientDetail` when the `id` query param is present (matching `PlanScreen.tsx`'s own established pattern of `id=new`/`id={n}` toggling between list and detail within the same top-level view — read `PlanScreen.tsx`'s `editingId`/`idParam` handling once more to match it exactly). Change `ClientRoster.tsx`'s row click handler (found in Step 1) from opening the edit modal to instead calling `setIdParam( client.id )`; render `<ClientDetail />` instead of the roster table when `idParam` is set. The roster's own "Edit" action (whatever triggers it today) stays as a modal launched *from* `ClientDetail.tsx` itself (Step 4), not from the roster row anymore.

- [ ] **Step 4: Add an "Edit" button to `ClientDetail.tsx` reusing the existing edit modal**

Import whatever modal/form component `ClientRoster.tsx` used for editing (identified in Step 1) into `ClientDetail.tsx`, add an "Edit" button next to the client's name in the header, and wire it to open that same modal — no new edit UI, the existing form is reused unchanged.

- [ ] **Step 5: Verify live against wp-env**

Log in to wp-admin, open the Clients screen, click a client row, confirm it navigates to the detail view showing compliance/logs/measurements (seed one client with an assigned plan and some logged entries first, via the existing Plan Builder + client portal, if none exist yet), confirm "Back to roster" and "Edit" both work.

- [ ] **Step 6: Run type-check/lint/build and commit**

Run: `npm run check-types && npm run lint:js && npm run build`
Expected: no errors.

```bash
git add src/screens/clients/ClientDetail.tsx src/screens/clients/ClientDetail.module.css src/screens/clients/ClientRoster.tsx
git commit -m "feat: add practitioner-facing client detail/report screen"
```

---

### Task 6: Wire the Dashboard to real data

**Files:**
- Modify: `src/screens/dashboard/Dashboard.tsx`

**Interfaces:**
- Consumes: `GET /dashboard/overview` (Task 3).
- Produces: no new exports — this is the final consumer of everything built in Tasks 1-5.

- [ ] **Step 1: Read the current Dashboard.tsx placeholder code**

Read `src/screens/dashboard/Dashboard.tsx` fully, noting the exact lines for `PLACEHOLDER_COMPLIANCE`, the "Logged today" KPI, the "Plans awaiting review" KPI, and the existing `useSelect()` calls for `clientCount`/`recipeCount` (to match their exact pattern).

- [ ] **Step 2: Add the overview fetch**

Add local state and a fetch, following this codebase's established `apiFetch`-in-`useEffect` pattern (as used throughout the client portal, e.g. `DashboardTab.tsx`) rather than a new `@wordpress/data` store — a single, page-scoped GET with no other component needing this data doesn't need store machinery:

```tsx
import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';

interface DashboardOverview {
	active_client_count: number;
	clients_without_plan_count: number;
	logged_today_count: number;
	draft_plan_count: number;
	compliance: Array< { client_id: number; name: string; percent: number } >;
}

// Inside the component:
const [ overview, setOverview ] = useState< DashboardOverview | undefined >( undefined );

useEffect( () => {
	apiFetch< DashboardOverview >( { path: '/merodiet/v1/dashboard/overview' } ).then(
		setOverview,
		() =>
			setOverview( {
				active_client_count: 0,
				clients_without_plan_count: 0,
				logged_today_count: 0,
				draft_plan_count: 0,
				compliance: [],
			} )
	);
}, [] );
```

- [ ] **Step 3: Replace the 3 hardcoded values**

Delete `PLACEHOLDER_COMPLIANCE` entirely. Replace the "Logged today" KPI's hardcoded `"8/12"` with:

```tsx
{ overview
	? `${ overview.logged_today_count }/${
			overview.active_client_count - overview.clients_without_plan_count
	  }`
	: <Skeleton width="50px" height="26px" /> }
```

Replace "Plans awaiting review"'s hardcoded `"3"` with `{ overview ? overview.draft_plan_count : <Skeleton width="30px" height="26px" /> }`.

Replace the compliance panel's `.map()` over `PLACEHOLDER_COMPLIANCE` with one over `overview?.compliance ?? []`, keeping the same row markup/classes, but making each row a link to `?view=clients&id={client_id}` (matching how any other cross-screen admin link in this codebase is constructed — check `src/utils` for an existing `adminUrl`/query-building helper before hand-building the URL string). Add one line below the compliance list: `{ overview && overview.clients_without_plan_count > 0 && <p>{overview.clients_without_plan_count} client(s) have no active plan.</p> }`.

- [ ] **Step 4: Verify live against wp-env**

Load the admin Dashboard with wp-env running and a seeded roster (mix of clients with/without plans), confirm the 3 replaced values show real numbers matching what you seeded, and confirm clicking a compliance row navigates to that client's detail screen from Task 5.

- [ ] **Step 5: Run type-check/lint/build and commit**

Run: `npm run check-types && npm run lint:js && npm run build`
Expected: no errors.

```bash
git add src/screens/dashboard/Dashboard.tsx
git commit -m "feat: wire admin Dashboard to real /dashboard/overview data"
```
