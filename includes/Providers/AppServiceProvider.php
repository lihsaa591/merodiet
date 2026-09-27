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
use Nutrio\Email\EmailTemplateService;
use Nutrio\Email\Mailer;
use Nutrio\Repositories\ClientRepository;

/**
 * Home for bindings that don't belong to a more specific provider.
 */
final class AppServiceProvider extends AbstractServiceProvider {

	/**
	 * Register ClientInviteService and the email-sending services every
	 * later task's controllers depend on.
	 *
	 * @param Container $container The DI container.
	 */
	public function register( Container $container ): void {
		$container->add( ClientInviteService::class )->addArgument( ClientRepository::class )->setShared( true );

		$container->add( EmailTemplateService::class )->setShared( true );
		$container->add( Mailer::class )->setShared( true )->addArgument( EmailTemplateService::class );
	}
}
