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
