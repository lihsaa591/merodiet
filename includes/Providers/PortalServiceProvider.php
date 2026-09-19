<?php
/**
 * Client-portal service provider.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Providers;

use League\Container\Container;
use Nutrio\Clients\PortalPage;
use Nutrio\Clients\PortalRewrite;
use Nutrio\Repositories\ClientRepository;

/**
 * Wires the client portal's rewrite registration, request handling, and
 * login redirect into WordPress — the front-end counterpart to
 * AdminServiceProvider/RestApiServiceProvider.
 */
final class PortalServiceProvider extends AbstractServiceProvider {

	/**
	 * Bind PortalPage with its ClientRepository dependency, mirroring
	 * RestApiServiceProvider's controller-wiring pattern.
	 *
	 * @param Container $container The DI container.
	 */
	public function register( Container $container ): void {
		if ( ! $container->has( ClientRepository::class ) ) {
			$container->add( ClientRepository::class )->setShared( true );
		}

		$container->add( PortalPage::class )
			->setShared( true )
			->addArgument( ClientRepository::class );
	}

	/**
	 * Hook the portal's routing, request handling, and login redirect.
	 *
	 * @param Container $container The DI container.
	 */
	public function boot( Container $container ): void {
		add_action( 'init', array( PortalRewrite::class, 'register' ) );

		add_action(
			'template_redirect',
			static function () use ( $container ) {
				/**
				 * The shared PortalPage instance.
				 *
				 * @var PortalPage $page
				 */
				$page = $container->get( PortalPage::class );
				$page->handle_request();
			}
		);

		add_filter(
			'login_redirect',
			static function ( $redirect_to, $requested_redirect_to, $user ) use ( $container ) {
				/**
				 * The shared PortalPage instance.
				 *
				 * @var PortalPage $page
				 */
				$page = $container->get( PortalPage::class );
				return $page->filter_login_redirect( $redirect_to, $requested_redirect_to, $user );
			},
			10,
			3
		);
	}
}
