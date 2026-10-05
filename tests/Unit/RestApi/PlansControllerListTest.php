<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit\RestApi;

use Brain\Monkey\Functions;
use MeroDiet\Email\EmailTemplateService;
use MeroDiet\Email\Mailer;
use MeroDiet\Nutrition\FoodCache;
use MeroDiet\Nutrition\PlanNutrientResolver;
use MeroDiet\Nutrition\RecipeNutrientResolver;
use MeroDiet\Repositories\ClientRepository;
use MeroDiet\Repositories\PlanRepository;
use MeroDiet\Repositories\RecipeRepository;
use MeroDiet\RestApi\PlansController;
use MeroDiet\Tests\TestCase;
use WP_REST_Request;

/**
 * The plans list resolves each plan's client itself, so the table never
 * depends on the client roster having been loaded in the browser.
 */
final class PlansControllerListTest extends TestCase {

	public function test_list_attaches_a_client_summary_to_assigned_plans_only(): void {
		Functions\when( 'get_current_user_id' )->justReturn( 42 );

		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'all_for_practitioner' )->willReturn(
			array(
				'items' => array(
					array( 'id' => 1, 'status' => 'assigned', 'client_id' => 9, 'nutrient_snapshot' => array() ),
					array( 'id' => 2, 'status' => 'assigned', 'client_id' => 9, 'nutrient_snapshot' => array() ),
					array( 'id' => 3, 'status' => 'draft', 'client_id' => null, 'nutrient_snapshot' => null ),
				),
				'total' => 3,
			)
		);

		$resolver = $this->createMock( PlanNutrientResolver::class );
		$resolver->method( 'calculate_plan_totals' )->willReturn( array() );

		// Two plans share a client — it must be looked up once, not per row.
		$clients = $this->createMock( ClientRepository::class );
		$clients->expects( self::once() )
			->method( 'find_for_practitioner' )
			->with( 9, 42 )
			->willReturn(
				array(
					'id'         => 9,
					'first_name' => 'Ana',
					'last_name'  => 'Lee',
					'avatar_url' => 'https://example.test/ana.jpg',
				)
			);

		$controller = new PlansController(
			$plans,
			$resolver,
			$clients,
			$this->createMock( FoodCache::class ),
			$this->createMock( RecipeRepository::class ),
			$this->createMock( RecipeNutrientResolver::class ),
			new Mailer( new EmailTemplateService() )
		);

		$items = $controller->list_plans( new WP_REST_Request() )->data['items'];

		$expected = array(
			'id'         => 9,
			'first_name' => 'Ana',
			'last_name'  => 'Lee',
			'avatar_url' => 'https://example.test/ana.jpg',
		);

		self::assertSame( $expected, $items[0]['client'] );
		self::assertSame( $expected, $items[1]['client'] );
		self::assertNull( $items[2]['client'] );
	}

	public function test_list_gives_null_when_the_assigned_client_no_longer_exists(): void {
		Functions\when( 'get_current_user_id' )->justReturn( 42 );

		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'all_for_practitioner' )->willReturn(
			array(
				'items' => array( array( 'id' => 1, 'status' => 'assigned', 'client_id' => 77, 'nutrient_snapshot' => array() ) ),
				'total' => 1,
			)
		);

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_practitioner' )->willReturn( null );

		$controller = new PlansController(
			$plans,
			$this->createMock( PlanNutrientResolver::class ),
			$clients,
			$this->createMock( FoodCache::class ),
			$this->createMock( RecipeRepository::class ),
			$this->createMock( RecipeNutrientResolver::class ),
			new Mailer( new EmailTemplateService() )
		);

		$items = $controller->list_plans( new WP_REST_Request() )->data['items'];

		self::assertNull( $items[0]['client'] );
	}
}
