<?php
/**
 * REST API service provider.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Providers;

use League\Container\Container;

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
 * entry, not provider code changes.
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
				if ( ! in_array( $dependency_class, $already_bound, true ) && ! $container->has( $dependency_class ) ) {
					$container->add( $dependency_class )->setShared( true );
					$already_bound[] = $dependency_class;
				}
			}

			$definition = $container->add( $controller_class )->setShared( true );

			foreach ( (array) $dependency_classes as $dependency_class ) {
				$definition->addArgument( $dependency_class );
			}
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
