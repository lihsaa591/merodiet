<?php
/**
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Tests\Unit\Email;

use Brain\Monkey\Functions;
use DateTimeZone;
use Nutrio\Email\DigestScheduler;
use Nutrio\Tests\TestCase;

final class DigestSchedulerTest extends TestCase {

	public function test_reschedule_clears_the_old_hook_and_does_nothing_else_when_disabled(): void {
		Functions\when( 'get_option' )->justReturn( false );

		$cleared = false;
		Functions\when( 'wp_clear_scheduled_hook' )->alias(
			static function () use ( &$cleared ) {
				$cleared = true;
			}
		);
		Functions\expect( 'wp_schedule_event' )->never();

		DigestScheduler::reschedule();

		self::assertTrue( $cleared );
	}

	public function test_reschedule_schedules_tomorrow_when_the_configured_time_already_passed_today(): void {
		Functions\when( 'wp_clear_scheduled_hook' )->justReturn( null );
		Functions\when( 'wp_timezone' )->justReturn( new DateTimeZone( 'UTC' ) );
		Functions\when( 'get_option' )->alias(
			static function ( string $name, $default = false ) {
				if ( 'nutrio_digest_enabled' === $name ) {
					return true;
				}
				if ( 'nutrio_digest_time' === $name ) {
					return '00:01'; // Almost certainly already passed "today" in any real run.
				}
				return $default;
			}
		);

		$scheduled_for = null;
		Functions\when( 'wp_schedule_event' )->alias(
			static function ( $timestamp, $recurrence, $hook ) use ( &$scheduled_for ) {
				$scheduled_for = $timestamp;
			}
		);

		DigestScheduler::reschedule();

		self::assertIsInt( $scheduled_for );
		self::assertGreaterThan( time(), $scheduled_for );
	}
}
