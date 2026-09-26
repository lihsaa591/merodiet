<?php
/**
 * Application configuration.
 *
 * Plain PHP array, no magic. Add a provider, a REST controller, or an
 * admin page here and nothing else needs to change.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

return array(

	/*
	 * Service providers, booted in this order. register() runs for every
	 * provider (in order) before boot() runs for any of them — see
	 * Plugin::run().
	 */
	'providers' => array(
		\Nutrio\Providers\AppServiceProvider::class,
		\Nutrio\Providers\DatabaseServiceProvider::class,
		\Nutrio\Providers\FoodDataServiceProvider::class,
		\Nutrio\Providers\RecipeServiceProvider::class,
		\Nutrio\Providers\PlanServiceProvider::class,
		\Nutrio\Providers\RestApiServiceProvider::class,
		\Nutrio\Providers\AdminServiceProvider::class,
		\Nutrio\Providers\PortalServiceProvider::class,
	),

	/*
	 * REST controllers, keyed by class-string with their constructor
	 * dependencies (if any) as an ordered values array — see
	 * RestApiServiceProvider's docblock for why this shape exists.
	 */
	'rest'      => array(
		'controllers' => array(
			\Nutrio\RestApi\ClientsController::class     => array( \Nutrio\Repositories\ClientRepository::class, \Nutrio\Clients\ClientInviteService::class ),
			\Nutrio\RestApi\FoodsController::class       => array( \Nutrio\Nutrition\FoodDataService::class ),
			\Nutrio\RestApi\CustomFoodsController::class => array( \Nutrio\Repositories\CustomFoodRepository::class ),
			\Nutrio\RestApi\RecipesController::class     => array(
				\Nutrio\Repositories\RecipeRepository::class,
				\Nutrio\Nutrition\RecipeNutrientResolver::class,
				\Nutrio\Nutrition\FoodCache::class,
			),
			\Nutrio\RestApi\PlansController::class       => array(
				\Nutrio\Repositories\PlanRepository::class,
				\Nutrio\Nutrition\PlanNutrientResolver::class,
				\Nutrio\Repositories\ClientRepository::class,
				\Nutrio\Nutrition\FoodCache::class,
				\Nutrio\Repositories\RecipeRepository::class,
				\Nutrio\Nutrition\RecipeNutrientResolver::class,
			),
			\Nutrio\RestApi\SettingsController::class    => array(),
			\Nutrio\RestApi\MeController::class          => array(
				\Nutrio\Repositories\PlanRepository::class,
				\Nutrio\Repositories\LogEntryRepository::class,
				\Nutrio\Repositories\MeasurementRepository::class,
				\Nutrio\Repositories\ClientRepository::class,
				\Nutrio\Nutrition\FoodCache::class,
				\Nutrio\Repositories\RecipeRepository::class,
			),
		),
	),

	/*
	 * Admin pages. One top-level page; Clients/Recipes/Plans are tabs
	 * inside its single React app, not separate wp-admin submenus.
	 */
	'admin'     => array(
		'pages' => array(
			array(
				'page_title'       => __( 'Nutrio', 'nutrio' ),
				'menu_title'       => __( 'Nutrio', 'nutrio' ),
				'capability'       => 'manage_nutrio_clients',
				'menu_slug'        => 'nutrio',
				'mount_element_id' => 'nutrio-admin-app',
				'script_entry'     => 'admin',
				'icon'             => 'dashicons-carrot',
				'position'         => 30,
			),
		),
	),

	/*
	 * USDA FoodData Central. The API key is per-site and stored as an
	 * option (see FoodDataServiceProvider) rather than hardcoded — this
	 * config only holds non-secret operational settings.
	 */
	'fooddata'  => array(
		'base_url'   => 'https://api.nal.usda.gov/fdc/v1',
		'timeout'    => 10,
		// Data types we accept, in preference order. Foundation and
		// SR Legacy report per 100 g and are the trustworthy baseline for
		// clinical use; Branded reports per serving and carries
		// manufacturer-supplied values.
		'data_types' => array( 'Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded' ),
		'cache_ttl'  => 0, // 0 = cache indefinitely; USDA entries are versioned, not volatile.
	),

);
