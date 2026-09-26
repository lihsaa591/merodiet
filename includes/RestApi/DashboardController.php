<?php
/**
 * Practitioner dashboard REST endpoint.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\RestApi;

use Nutrio\Clients\ComplianceCalculator;
use Nutrio\Repositories\ClientRepository;
use Nutrio\Repositories\LogEntryRepository;
use Nutrio\Repositories\PlanRepository;
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
	 * Route base — registers under nutrio/v1/dashboard.
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
	 * @param LogEntryRepository   $logs       Used only for "logged today" — a raw
	 *                                         activity check (any log entry, including
	 *                                         ad-hoc ones ComplianceCalculator deliberately
	 *                                         excludes), not a compliance calculation.
	 */
	public function __construct(
		private readonly ClientRepository $clients,
		private readonly PlanRepository $plans,
		private readonly ComplianceCalculator $compliance,
		private readonly LogEntryRepository $logs
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
			required_capability: 'manage_nutrio_clients'
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

			// "Logged today" means any activity today — including an
			// ad-hoc entry not tied to a scheduled plan item, which
			// ComplianceCalculator deliberately excludes (it measures
			// plan adherence, not general activity) — so this is a raw
			// LogEntryRepository check, not a second calculate() call.
			$todays_logs = $this->logs->all_for_client(
				(int) $client['id'],
				array(
					'from' => $today,
					'to'   => $today,
				)
			);

			if ( count( $todays_logs ) > 0 ) {
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
