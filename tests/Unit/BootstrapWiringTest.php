<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit;

use Brain\Monkey\Functions;
use League\Container\Container;
use MeroDiet\Tests\TestCase;

/**
 * Loads the REAL config/app.php and runs every REAL provider's
 * register() phase — exactly what bootstrap/app.php does at runtime —
 * then asserts every configured REST controller actually resolves.
 *
 * This exists because two real bugs were found manually in this exact
 * area during development: league/container does not autowire
 * constructor dependencies (an unconfigured one throws), and a bare
 * class-string passed to addArgument() only resolves through the
 * container if that class happens to already be registered — neither
 * failure mode is something PHPStan or a narrower unit test catches,
 * since both are runtime container-resolution behavior, not a type
 * error. Whenever a new controller or a new dependency is added to
 * config/app.php, this suite is what proves the whole wiring graph
 * actually resolves, not just that each piece compiles.
 */
final class BootstrapWiringTest extends TestCase {

	public function test_every_configured_rest_controller_resolves_without_error(): void {
		Functions\when( 'get_option' )->justReturn( '' );

		$container = $this->build_container();

		$controller_classes = array_keys( (array) $container->get( 'config' )['rest']['controllers'] );

		self::assertNotEmpty( $controller_classes, 'config/app.php should configure at least one controller — otherwise this test proves nothing.' );

		foreach ( $controller_classes as $controller_class ) {
			$controller = $container->get( $controller_class );

			self::assertInstanceOf( $controller_class, $controller );
		}
	}

	private function build_container(): Container {
		$config = require dirname( __DIR__, 2 ) . '/config/app.php';

		$container = new Container();
		$container->add( 'config', $config )->setShared( true );

		foreach ( $config['providers'] as $provider_class ) {
			( new $provider_class() )->register( $container );
		}

		return $container;
	}
}
