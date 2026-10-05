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
	 * Compute the compliance percentage for a client over a date window.
	 *
	 * @param int    $client_id Internal client ID.
	 * @param string $from      Window start, 'Y-m-d'.
	 * @param string $to        Window end, 'Y-m-d'.
	 *
	 * @return array{plan: array{id:int,title:string,start_date:string,end_date:string}|null, percent: int|null, logged_count: int, total_count: int, window: array{from:string,to:string}}
	 */
	public function calculate( int $client_id, string $from, string $to ): array {
		$window = array(
			'from' => $from,
			'to'   => $to,
		);
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

		$plan_start  = new DateTimeImmutable( (string) $plan['start_date'] );
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
