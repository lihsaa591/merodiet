<?php
/**
 * Recipe domain-object wiring.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Providers;

use League\Container\Container;
use Nutrio\Nutrition\FoodCache;
use Nutrio\Nutrition\RecipeNutrientResolver;
use Nutrio\Repositories\RecipeRepository;

/**
 * Registers RecipeRepository and RecipeNutrientResolver with their
 * correct constructor wiring, before RestApiServiceProvider runs.
 *
 * This exists because RestApiServiceProvider's config-driven wiring
 * (see its own docblock) only handles a controller's *direct*
 * dependencies — it does a bare, argument-less add() for each one,
 * which is fine for a zero-constructor-argument class but fails for
 * RecipeNutrientResolver (needs RecipeRepository + FoodCache) exactly
 * the way an unconfigured league/container binding always fails:
 * loudly, with a clear ContainerException, not silently. Domain
 * objects with real constructor dependencies get their own provider,
 * registered earlier in config('providers') — the same pattern
 * FoodDataServiceProvider already uses for FoodDataClient/FoodDataService.
 */
final class RecipeServiceProvider extends AbstractServiceProvider {

	/**
	 * Bind the recipe repository and its nutrient resolver.
	 *
	 * @param Container $container The DI container.
	 */
	public function register( Container $container ): void {
		$container->add( RecipeRepository::class )->setShared( true );

		$container->add( RecipeNutrientResolver::class )
			->addArgument( RecipeRepository::class )
			->addArgument( FoodCache::class )
			->setShared( true );
	}
}
