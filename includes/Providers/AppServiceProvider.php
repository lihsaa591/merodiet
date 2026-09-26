<?php
/**
 * General application bindings.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Providers;

use League\Container\Container;
use Nutrio\Clients\ClientInviteService;
use Nutrio\Repositories\ClientRepository;

/**
 * Home for bindings that don't belong to a more specific provider.
 * Kept deliberately empty in the boilerplate — a real plugin's own
 * cross-cutting bindings (a settings repository, a mailer, ...) go here.
 */
final class AppServiceProvider extends AbstractServiceProvider {

	/**
	 * Register ClientInviteService with its dependency on ClientRepository.
	 *
	 * @param Container $container The DI container.
	 */
	public function register( Container $container ): void {
		$container->add( ClientInviteService::class )->addArgument( ClientRepository::class )->setShared( true );
	}
}
