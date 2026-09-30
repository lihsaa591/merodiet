<?php
/**
 * Builds and sends the daily per-practitioner client-activity digest.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Email;

use Nutrio\Repositories\ClientRepository;
use Nutrio\Repositories\LogEntryRepository;

/**
 * Hooked to DigestScheduler::CRON_HOOK (see AppServiceProvider::boot()).
 * Iterates every user with the practitioner role — deliberately not
 * "the current user" (there is none, in a cron context) — and skips
 * anyone with zero active clients so an empty roster never produces
 * empty-digest noise.
 */
final class DigestMailer {

	/**
	 * Constructor.
	 *
	 * @param Mailer             $mailer  Renders and sends the digest.
	 * @param ClientRepository   $clients Reads each practitioner's active roster.
	 * @param LogEntryRepository $logs    Reads today's log entries for the per-client table.
	 */
	public function __construct(
		private readonly Mailer $mailer,
		private readonly ClientRepository $clients,
		private readonly LogEntryRepository $logs
	) {}

	/**
	 * Build and send today's digest to every practitioner with an active roster.
	 */
	public function run(): void {
		$today = current_time( 'Y-m-d' );

		foreach ( get_users( array( 'role' => 'practitioner' ) ) as $practitioner ) {
			$roster = $this->clients->all_for_practitioner(
				(int) $practitioner->ID,
				1,
				10000, // Same "give me effectively everyone" idiom DashboardController::get_overview() already uses.
				array( 'status' => 'active' )
			);

			if ( 0 === count( $roster['items'] ) ) {
				continue;
			}

			$this->mailer->send(
				'practitioner_daily_digest',
				$practitioner->user_email,
				array(
					'practitioner_name' => $practitioner->display_name,
					'report_date'       => $today,
					'report_table'      => new RawHtml( $this->build_report_table( $roster['items'], $today ) ),
				)
			);
		}
	}

	/**
	 * Builds the per-client "logged today / no activity" HTML table.
	 *
	 * @param array<int, array<string, mixed>> $clients The practitioner's active roster.
	 * @param string                           $today   Y-m-d, today in the site's own timezone.
	 */
	private function build_report_table( array $clients, string $today ): string {
		$rows = array();

		foreach ( $clients as $client ) {
			$todays_logs = $this->logs->all_for_client(
				(int) $client['id'],
				array(
					'from' => $today,
					'to'   => $today,
				)
			);

			$rows[] = sprintf(
				'<tr><td>%1$s %2$s</td><td>%3$s</td></tr>',
				esc_html( (string) ( $client['first_name'] ?? '' ) ),
				esc_html( (string) ( $client['last_name'] ?? '' ) ),
				count( $todays_logs ) > 0
					? esc_html__( 'Logged today', 'nutrio' )
					: esc_html__( 'No activity', 'nutrio' )
			);
		}

		return '<table>' . implode( '', $rows ) . '</table>';
	}
}
