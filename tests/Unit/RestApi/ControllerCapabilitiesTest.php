<?php
/**
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Tests\Unit\RestApi;

use Brain\Monkey\Functions;
use Nutrio\Clients\ClientInviteService;
use Nutrio\Clients\ComplianceCalculator;
use Nutrio\Email\Mailer;
use Nutrio\Nutrition\FoodCache;
use Nutrio\Nutrition\FoodDataService;
use Nutrio\Nutrition\PlanNutrientResolver;
use Nutrio\Nutrition\RecipeNutrientResolver;
use Nutrio\Repositories\ClientRepository;
use Nutrio\Repositories\LogEntryRepository;
use Nutrio\Repositories\MeasurementRepository;
use Nutrio\Repositories\PlanRepository;
use Nutrio\Repositories\RecipeRepository;
use Nutrio\RestApi\ClientsController;
use Nutrio\RestApi\FoodsController;
use Nutrio\RestApi\MeController;
use Nutrio\RestApi\PlansController;
use Nutrio\RestApi\RecipesController;
use Nutrio\Tests\TestCase;

/**
 * Every Nutrio REST route must be gated by its own resource-specific
 * capability (manage_nutrio_clients, manage_nutrio_recipes, etc.) —
 * NOT the framework default of 'manage_options'. A route that silently
 * falls back to the default would mean only a WordPress Administrator
 * could ever use it, defeating the entire point of the 'practitioner'
 * role RoleRegistrar defines. This suite exists because exactly that
 * bug was found during manual review: every register_route() call
 * across all four controllers had been written without a
 * required_capability argument at all.
 */
final class ControllerCapabilitiesTest extends TestCase {

	/**
	 * @return array<string, array{0: class-string, 1: array<int, class-string>, 2: string}>
	 */
	public static function controller_provider(): array {
		return array(
			'ClientsController' => array(
				ClientsController::class,
				array(
					ClientRepository::class,
					\Nutrio\Clients\ClientInviteService::class,
					LogEntryRepository::class,
					MeasurementRepository::class,
					ComplianceCalculator::class,
					Mailer::class,
				),
				'manage_nutrio_clients',
			),
			'RecipesController'  => array( RecipesController::class, array( RecipeRepository::class, RecipeNutrientResolver::class, FoodCache::class ), 'manage_nutrio_recipes' ),
			'FoodsController'    => array( FoodsController::class, array( FoodDataService::class ), 'manage_nutrio_foods' ),
			'PlansController'    => array( PlansController::class, array( PlanRepository::class, PlanNutrientResolver::class, ClientRepository::class, FoodCache::class, RecipeRepository::class, RecipeNutrientResolver::class, Mailer::class ), 'manage_nutrio_plans' ),
			'MeController'       => array(
				MeController::class,
				array(
					PlanRepository::class,
					LogEntryRepository::class,
					MeasurementRepository::class,
					ClientRepository::class,
					FoodCache::class,
					RecipeRepository::class,
				),
				'view_own_nutrio_plan',
			),
		);
	}

	/**
	 * @dataProvider controller_provider
	 *
	 * @param class-string          $controller_class
	 * @param array<int, class-string> $dependency_classes
	 */
	public function test_every_route_requires_its_own_resource_capability_not_the_default( string $controller_class, array $dependency_classes, string $expected_capability ): void {
		$captured_endpoints = array();
		Functions\when( 'register_rest_route' )->alias(
			function ( $namespace, $route, $endpoint ) use ( &$captured_endpoints ) {
				$captured_endpoints[] = $endpoint;
			}
		);

		$controller = $this->build_controller_via_mocked_dependencies( $controller_class, $dependency_classes );
		$controller->register_routes();

		self::assertNotEmpty( $captured_endpoints, "{$controller_class} registered no routes at all." );

		foreach ( $captured_endpoints as $endpoint ) {
			self::assertTrue(
				$this->permission_callback_checks_capability( $endpoint['permission_callback'], $expected_capability ),
				"A route on {$controller_class} is not gated by '{$expected_capability}' — it may have fallen back to the 'manage_options' default."
			);
		}
	}

	/**
	 * Proves a permission_callback checks the EXACT expected capability
	 * by making current_user_can() return true only for that capability
	 * and false for everything else (including the 'manage_options'
	 * default), then confirming the callback grants access only then.
	 */
	private function permission_callback_checks_capability( callable $permission_callback, string $expected_capability ): bool {
		if ( '__return_true' === $permission_callback ) {
			return false; // A public route can never be checking a capability.
		}

		Functions\when( 'current_user_can' )->alias(
			static fn ( string $capability ) => $capability === $expected_capability
		);
		Functions\when( 'rest_authorization_required_code' )->justReturn( 403 );

		$fake_request = new \WP_REST_Request();

		return true === $permission_callback( $fake_request );
	}

	/**
	 * @param class-string             $controller_class
	 * @param array<int, class-string> $dependency_classes
	 */
	private function build_controller_via_mocked_dependencies( string $controller_class, array $dependency_classes ) {
		$mocks = array_map(
			fn ( string $class ) => $this->build_dependency_mock( $class ),
			$dependency_classes
		);

		return new $controller_class( ...$mocks );
	}

	/**
	 * Build a mock for a dependency, handling final classes specially.
	 *
	 * @param class-string $class The class to mock or instantiate.
	 */
	private function build_dependency_mock( string $class ) {
		// For final classes, construct with mocked dependencies instead of mocking the class itself.
		if ( ClientInviteService::class === $class ) {
			return new ClientInviteService( $this->createMock( ClientRepository::class ) );
		}

		if ( ComplianceCalculator::class === $class ) {
			return new ComplianceCalculator(
				$this->createMock( \Nutrio\Repositories\PlanRepository::class ),
				$this->createMock( LogEntryRepository::class )
			);
		}

		if ( Mailer::class === $class ) {
			return new Mailer( new \Nutrio\Email\EmailTemplateService() );
		}

		return $this->createMock( $class );
	}
}
