<?php
/**
 * REST API service provider.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Providers;

use League\Container\Container;
use ReflectionClass;
use ReflectionNamedType;

/**
 * Reads config('rest.controllers') and registers each controller's
 * routes on rest_api_init. Add a controller by listing it in
 * config/app.php, keyed by its own class-string, with its constructor
 * dependencies (if any) as a values array in the order the constructor
 * expects them:
 *
 *     'controllers' => [
 *         ExampleController::class => [],
 *         ClientsController::class => [ ClientRepository::class ],
 *     ]
 *
 * league/container does not autowire constructor dependencies by
 * reflecting type-hints (verified directly against the installed
 * version — an unconfigured dependency throws ContainerException, it
 * doesn't get silently resolved) — every dependency must be explicitly
 * wired via addArgument(). This provider does that generically from
 * config so a new controller with dependencies needs only a config
 * entry, not provider code changes. An auto-bound dependency that
 * itself has constructor dependencies (e.g. ComplianceCalculator,
 * which needs PlanRepository/LogEntryRepository) is wired the same
 * way, recursively, via bind_recursively() — so it never needs its
 * own config entry either.
 */
final class RestApiServiceProvider extends AbstractServiceProvider {

	/**
	 * Bind each configured controller (and its dependencies) as shared services.
	 *
	 * @param Container $container The DI container.
	 */
	public function register( Container $container ): void {
		$config = $container->get( 'config' );

		$already_bound = array();

		foreach ( (array) ( $config['rest']['controllers'] ?? array() ) as $controller_class => $dependency_classes ) {
			foreach ( (array) $dependency_classes as $dependency_class ) {
				self::bind_recursively( $container, (string) $dependency_class, $already_bound );
			}

			$definition = $container->add( $controller_class )->setShared( true );

			foreach ( (array) $dependency_classes as $dependency_class ) {
				$definition->addArgument( $dependency_class );
			}
		}
	}

	/**
	 * Bind a class (and, recursively, every constructor dependency it
	 * needs that isn't already bound) as a shared service.
	 *
	 * @param Container         $container      The DI container.
	 * @param string            $class_name     The class to bind.
	 * @param array<int,string> $already_bound  Classes already queued for binding in this pass.
	 */
	private static function bind_recursively( Container $container, string $class_name, array &$already_bound ): void {
		if ( in_array( $class_name, $already_bound, true ) || $container->has( $class_name ) ) {
			return;
		}

		$already_bound[] = $class_name;

		$constructor = ( new ReflectionClass( $class_name ) )->getConstructor();
		$definition  = $container->add( $class_name )->setShared( true );

		if ( null === $constructor ) {
			return;
		}

		foreach ( $constructor->getParameters() as $parameter ) {
			$type = $parameter->getType();

			if ( ! $type instanceof ReflectionNamedType || $type->isBuiltin() ) {
				continue;
			}

			$dependency_class = $type->getName();

			self::bind_recursively( $container, $dependency_class, $already_bound );
			$definition->addArgument( $dependency_class );
		}
	}

	/**
	 * Register every configured controller's routes on rest_api_init.
	 *
	 * @param Container $container The DI container.
	 */
	public function boot( Container $container ): void {
		$config = $container->get( 'config' );

		add_action(
			'rest_api_init',
			static function () use ( $container, $config ) {
				foreach ( array_keys( (array) ( $config['rest']['controllers'] ?? array() ) ) as $controller_class ) {
					$container->get( $controller_class )->register_routes();
				}
			}
		);
	}
}
