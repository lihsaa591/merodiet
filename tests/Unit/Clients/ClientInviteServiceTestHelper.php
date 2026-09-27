<?php
/**
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Tests\Unit\Clients;

use Nutrio\Clients\ClientInviteService;
use ReflectionProperty;

/**
 * Test-only reflection shim: ClientInviteService::$sending_invite is
 * intentionally private with no public setter (see its own docblock —
 * it's only ever toggled from inside invite() itself, via try/finally).
 * This exists so PortalPageTest can exercise the "currently sending an
 * invite" branch without going through a real invite() call, which
 * would need an unrelated pile of wp_insert_user()/retrieve_password()
 * stubs that this test doesn't otherwise care about.
 */
final class ClientInviteServiceTestHelper {

	public static function force_sending_invite( bool $value ): void {
		$property = new ReflectionProperty( ClientInviteService::class, 'sending_invite' );
		$property->setAccessible( true );
		$property->setValue( null, $value );
	}
}
