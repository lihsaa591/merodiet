<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit\Providers;

use Brain\Monkey\Functions;
use League\Container\Container;
use MeroDiet\Providers\RestApiServiceProvider;
use MeroDiet\Tests\TestCase;

/**
 * Uses a real league/container instance rather than a mock — the whole
 * point of this suite is proving the config-driven addArgument() wiring
 * actually resolves, since league/container does NOT autowire
 * constructor dependencies by reflecting type-hints (verified directly
 * against the installed library; an unconfigured dependency throws
 * ContainerException rather than resolving silently). A controller
 * with a constructor dependency and no config entry for it is exactly
 * the class of bug this suite exists to catch.
 */
final class RestApiServiceProviderTest extends TestCase {

	public function test_controller_with_no_dependencies_resolves(): void {
		$container = $this->container_with_controllers(
			array( NoDependencyController::class => array() )
		);

		$controller = $container->get( NoDependencyController::class );

		self::assertInstanceOf( NoDependencyController::class, $controller );
	}

	public function test_controller_with_a_dependency_is_correctly_wired(): void {
		$container = $this->container_with_controllers(
			array( OneDependencyController::class => array( FakeRepository::class ) )
		);

		$controller = $container->get( OneDependencyController::class );

		self::assertInstanceOf( OneDependencyController::class, $controller );
		self::assertSame( 'fake-repository-value', $controller->describe_dependency() );
	}

	public function test_a_shared_dependency_used_by_two_controllers_is_the_same_instance(): void {
		$container = $this->container_with_controllers(
			array(
				OneDependencyController::class    => array( FakeRepository::class ),
				AnotherDependentController::class => array( FakeRepository::class ),
			)
		);

		$first  = $container->get( OneDependencyController::class );
		$second = $container->get( AnotherDependentController::class );

		self::assertSame( $first->repository(), $second->repository() );
	}

	public function test_boot_registers_routes_for_every_configured_controller_on_rest_api_init(): void {
		$container = $this->container_with_controllers(
			array( NoDependencyController::class => array() )
		);

		$captured_callback = null;
		Functions\when( 'add_action' )->alias(
			function ( string $hook, callable $callback ) use ( &$captured_callback ) {
				if ( 'rest_api_init' === $hook ) {
					$captured_callback = $callback;
				}
			}
		);

		( new RestApiServiceProvider() )->boot( $container );

		self::assertNotNull( $captured_callback );

		$captured_callback();

		self::assertTrue( $container->get( NoDependencyController::class )->routes_were_registered() );
	}

	/**
	 * @param array<string, array<int, string>> $controllers
	 */
	private function container_with_controllers( array $controllers ): Container {
		$container = new Container();
		$container->add( 'config', array( 'rest' => array( 'controllers' => $controllers ) ) )->setShared( true );

		( new RestApiServiceProvider() )->register( $container );

		return $container;
	}
}

// -----------------------------------------------------------------------
// Fixtures — deliberately not real MeroDiet controllers, so this suite
// tests the wiring mechanism itself, independent of any real
// controller's own behavior.
// -----------------------------------------------------------------------

final class FakeRepository {
	public function value(): string {
		return 'fake-repository-value';
	}
}

final class NoDependencyController {
	private bool $routes_registered = false;

	public function register_routes(): void {
		$this->routes_registered = true;
	}

	public function routes_were_registered(): bool {
		return $this->routes_registered;
	}
}

final class OneDependencyController {
	public function __construct( private FakeRepository $repository ) {}

	public function register_routes(): void {}

	public function describe_dependency(): string {
		return $this->repository->value();
	}

	public function repository(): FakeRepository {
		return $this->repository;
	}
}

final class AnotherDependentController {
	public function __construct( private FakeRepository $repository ) {}

	public function register_routes(): void {}

	public function repository(): FakeRepository {
		return $this->repository;
	}
}
