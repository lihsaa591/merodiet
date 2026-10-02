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
			->addArgument( ClientRepository::class )
			->addArgument( \Nutrio\Email\Mailer::class );
	}

	/**
	 * Hook the portal's routing, request handling, and login redirect.
	 *
	 * @param Container $container The DI container.
	 */
	public function boot( Container $container ): void {
		add_action( 'init', array( PortalRewrite::class, 'register' ) );

		add_action(
			'init',
			static function () use ( $container ) {
				/**
				 * The shared PortalPage instance.
				 *
				 * @var PortalPage $page
				 */
				$page = $container->get( PortalPage::class );
				add_shortcode( 'nutrio_client_portal', array( $page, 'render_shortcode' ) );
			}
		);

		// A site that already had Nutrio active before this feature shipped
		// won't otherwise get the rewrite rule onto disk until someone
		// resaves Settings -> Permalinks. Catch it up once, the same way
		// DatabaseServiceProvider catches up pending migrations.
		add_action(
			'admin_init',
			static function () {
				if ( '1' === get_option( 'nutrio_portal_rewrite_flushed' ) ) {
					return;
				}

				flush_rewrite_rules();
				update_option( 'nutrio_portal_rewrite_flushed', '1' );
			}
		);

		// WordPress core's own admin-bar setup (_wp_admin_bar_init()) is
		// hooked to 'template_redirect' at priority 0 — earlier than any
		// default-priority hook we add there. Suppressing the bar must
		// happen on 'wp' instead, which fires before 'template_redirect',
		// so the filter is already in place by the time core reads it.
		add_action(
			'wp',
			static function () {
				if ( get_query_var( PortalRewrite::QUERY_VAR ) ) {
					add_filter( 'show_admin_bar', '__return_false' );
				}
			}
		);

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

		add_filter(
			'retrieve_password_message',
			static function ( $message, $key, $user_login, $user_data ) use ( $container ) {
				/**
				 * The shared PortalPage instance.
				 *
				 * @var PortalPage $page
				 */
				$page = $container->get( PortalPage::class );
				return $page->customize_reset_password_email( $message, $key, $user_login, $user_data );
			},
			10,
			4
		);

		add_filter(
			'retrieve_password_title',
			static function ( $title, $user_login, $user_data ) use ( $container ) {
				/**
				 * The shared PortalPage instance.
				 *
				 * @var PortalPage $page
				 */
				$page = $container->get( PortalPage::class );
				return $page->customize_reset_password_subject( $title, $user_login, $user_data );
			},
			10,
			3
		);
	}
}
