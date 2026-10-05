<?php
/**
 * Application configuration.
 *
 * Plain PHP array, no magic. Add a provider, a REST controller, or an
 * admin page here and nothing else needs to change.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

return array(

	/*
	 * Service providers, booted in this order. register() runs for every
	 * provider (in order) before boot() runs for any of them — see
	 * Plugin::run().
	 */
	'providers' => array(
		\MeroDiet\Providers\AppServiceProvider::class,
		\MeroDiet\Providers\DatabaseServiceProvider::class,
		\MeroDiet\Providers\FoodDataServiceProvider::class,
		\MeroDiet\Providers\RecipeServiceProvider::class,
		\MeroDiet\Providers\PlanServiceProvider::class,
		\MeroDiet\Providers\RestApiServiceProvider::class,
		\MeroDiet\Providers\AdminServiceProvider::class,
		\MeroDiet\Providers\PortalServiceProvider::class,
	),

	/*
	 * REST controllers, keyed by class-string with their constructor
	 * dependencies (if any) as an ordered values array — see
	 * RestApiServiceProvider's docblock for why this shape exists.
	 */
	'rest'      => array(
		'controllers' => array(
			\MeroDiet\RestApi\ClientsController::class     => array(
				\MeroDiet\Repositories\ClientRepository::class,
				\MeroDiet\Clients\ClientInviteService::class,
				\MeroDiet\Repositories\LogEntryRepository::class,
				\MeroDiet\Repositories\MeasurementRepository::class,
				\MeroDiet\Clients\ComplianceCalculator::class,
				\MeroDiet\Email\Mailer::class,
				\MeroDiet\Clients\LogEntryLabelResolver::class,
			),
			\MeroDiet\RestApi\FoodsController::class       => array( \MeroDiet\Nutrition\FoodDataService::class ),
			\MeroDiet\RestApi\CustomFoodsController::class => array( \MeroDiet\Repositories\CustomFoodRepository::class ),
			\MeroDiet\RestApi\RecipesController::class     => array(
				\MeroDiet\Repositories\RecipeRepository::class,
				\MeroDiet\Nutrition\RecipeNutrientResolver::class,
				\MeroDiet\Nutrition\FoodCache::class,
			),
			\MeroDiet\RestApi\PlansController::class       => array(
				\MeroDiet\Repositories\PlanRepository::class,
				\MeroDiet\Nutrition\PlanNutrientResolver::class,
				\MeroDiet\Repositories\ClientRepository::class,
				\MeroDiet\Nutrition\FoodCache::class,
				\MeroDiet\Repositories\RecipeRepository::class,
				\MeroDiet\Nutrition\RecipeNutrientResolver::class,
				\MeroDiet\Email\Mailer::class,
			),
			\MeroDiet\RestApi\SettingsController::class    => array( \MeroDiet\Email\EmailTemplateService::class ),
			\MeroDiet\RestApi\MeController::class          => array(
				\MeroDiet\Repositories\PlanRepository::class,
				\MeroDiet\Repositories\LogEntryRepository::class,
				\MeroDiet\Repositories\MeasurementRepository::class,
				\MeroDiet\Repositories\ClientRepository::class,
				\MeroDiet\Nutrition\FoodCache::class,
				\MeroDiet\Repositories\RecipeRepository::class,
				\MeroDiet\Nutrition\RecipeNutrientResolver::class,
			),
			\MeroDiet\RestApi\DashboardController::class   => array(
				\MeroDiet\Repositories\ClientRepository::class,
				\MeroDiet\Repositories\PlanRepository::class,
				\MeroDiet\Clients\ComplianceCalculator::class,
				\MeroDiet\Repositories\LogEntryRepository::class,
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
				'page_title'       => __( 'MeroDiet', 'merodiet' ),
				'menu_title'       => __( 'MeroDiet', 'merodiet' ),
				'capability'       => 'manage_merodiet_clients',
				'menu_slug'        => 'merodiet',
				'mount_element_id' => 'merodiet-admin-app',
				'script_entry'     => 'admin',
				'icon'             => MERODIET_URL . 'assets/images/merodiet-leaf.png',
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
