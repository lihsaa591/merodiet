<?php
/**
 * Plan domain-object wiring.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Providers;

use League\Container\Container;
use MeroDiet\Nutrition\FoodCache;
use MeroDiet\Nutrition\PlanNutrientResolver;
use MeroDiet\Nutrition\RecipeNutrientResolver;
use MeroDiet\Repositories\PlanRepository;

/**
 * Registers PlanRepository and PlanNutrientResolver with their correct
 * constructor wiring, before RestApiServiceProvider runs — see
 * RecipeServiceProvider's docblock for why this pattern exists
 * (domain objects with real constructor dependencies get their own
 * provider; RestApiServiceProvider's generic wiring only handles a
 * controller's *direct* dependencies with a bare add()).
 */
final class PlanServiceProvider extends AbstractServiceProvider {

	/**
	 * Bind the plan repository and its nutrient resolver.
	 *
	 * @param Container $container The DI container.
	 */
	public function register( Container $container ): void {
		$container->add( PlanRepository::class )->setShared( true );

		$container->add( PlanNutrientResolver::class )
			->addArgument( PlanRepository::class )
			->addArgument( FoodCache::class )
			->addArgument( RecipeNutrientResolver::class )
			->setShared( true );
	}
}
