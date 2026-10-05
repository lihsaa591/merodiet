<?php
/**
 * Schedules (or clears) the daily practitioner digest's WP-Cron event.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Email;

use DateTimeImmutable;

/**
 * WP-Cron has no native "run at this specific wall-clock time" concept
 * — wp_schedule_event()'s recurrence just repeats every N seconds from
 * whenever it was first scheduled. To honor a practitioner-chosen
 * time-of-day, this always clears any existing scheduled event first,
 * then (if enabled) computes the next real occurrence of that time in
 * the site's own timezone (today if it hasn't passed yet, otherwise
 * tomorrow) and schedules from there — 'daily' then keeps landing at
 * the same wall-clock time every day after.
 */
final class DigestScheduler {

	public const CRON_HOOK = 'merodiet_daily_digest';

	/**
	 * Called whenever merodiet_digest_enabled/merodiet_digest_time is
	 * saved (SettingsController::update_email_digest()), and once from
	 * Activation::activate().
	 */
	public static function reschedule(): void {
		wp_clear_scheduled_hook( self::CRON_HOOK );

		if ( ! (bool) get_option( 'merodiet_digest_enabled', false ) ) {
			return;
		}

		$time = (string) get_option( 'merodiet_digest_time', '20:00' );
		$now  = new DateTimeImmutable( 'now', wp_timezone() );

		$target = DateTimeImmutable::createFromFormat(
			'Y-m-d H:i',
			$now->format( 'Y-m-d' ) . ' ' . $time,
			wp_timezone()
		);

		if ( false === $target ) {
			return; // Malformed time — SettingsController validates this before saving, but nothing safe to schedule if it somehow got here anyway.
		}

		if ( $target <= $now ) {
			$target = $target->modify( '+1 day' );
		}

		wp_schedule_event( $target->getTimestamp(), 'daily', self::CRON_HOOK );
	}
}
