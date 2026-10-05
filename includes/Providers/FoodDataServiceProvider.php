<?php
/**
 * USDA FoodData Central service provider.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Providers;

use League\Container\Container;
use MeroDiet\Nutrition\FoodCache;
use MeroDiet\Nutrition\FoodDataClient;
use MeroDiet\Nutrition\FoodDataService;

/**
 * Binds the food-data stack. The API key is a site option
 * (`merodiet_usda_api_key`) rather than a config-file constant — it's
 * per-installation and practitioner-supplied (a future settings screen
 * writes it), not something that belongs in version-controlled config.
 */
final class FoodDataServiceProvider extends AbstractServiceProvider {

	/**
	 * Bind the food-data client, cache, and orchestrating service.
	 *
	 * @param Container $container The DI container.
	 */
	public function register( Container $container ): void {
		$container->add( FoodCache::class )->setShared( true );

		$container->add(
			FoodDataClient::class,
			static function () use ( $container ) {
				$config = $container->get( 'config' );

				return new FoodDataClient(
					(string) get_option( 'merodiet_usda_api_key', '' ),
					(string) ( $config['fooddata']['base_url'] ?? 'https://api.nal.usda.gov/fdc/v1' ),
					(int) ( $config['fooddata']['timeout'] ?? 10 )
				);
			}
		)->setShared( true );

		$container->add(
			FoodDataService::class,
			static function () use ( $container ) {
				$config = $container->get( 'config' );

				return new FoodDataService(
					$container->get( FoodDataClient::class ),
					$container->get( FoodCache::class ),
					(array) ( $config['fooddata']['data_types'] ?? array( 'Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded' ) )
				);
			}
		)->setShared( true );
	}
}
