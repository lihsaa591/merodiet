<?php
declare( strict_types=1 );

namespace Nutrio\Tests\Unit\Clients;

use Nutrio\Clients\LogEntryLabelResolver;
use Nutrio\Nutrition\FoodCache;
use Nutrio\Repositories\PlanRepository;
use Nutrio\Repositories\RecipeRepository;
use PHPUnit\Framework\TestCase;

final class LogEntryLabelResolverTest extends TestCase {

	private function entry( ?int $plan_item_id, ?int $food_id = null, ?int $recipe_id = null ): array {
		return array(
			'plan_item_id' => $plan_item_id,
			'food_id'      => $food_id,
			'recipe_id'    => $recipe_id,
		);
	}

	public function test_resolves_label_from_plan_item_food_and_recipe(): void {
		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'find_item' )->willReturnMap(
			array(
				array( 1, array( 'food_id' => 10, 'recipe_id' => null ) ),
				array( 2, array( 'food_id' => null, 'recipe_id' => 20 ) ),
			)
		);
		$foods = $this->createMock( FoodCache::class );
		$foods->method( 'find' )->with( 10 )->willReturn( array( 'description' => 'Oatmeal' ) );
		$recipes = $this->createMock( RecipeRepository::class );
		$recipes->method( 'find' )->with( 20 )->willReturn( array( 'name' => 'Lentil soup' ) );

		$result = ( new LogEntryLabelResolver( $plans, $foods, $recipes ) )->with_labels(
			array( $this->entry( 1 ), $this->entry( 2 ) )
		);

		self::assertSame( 'Oatmeal', $result[0]['label'] );
		self::assertSame( 'Lentil soup', $result[1]['label'] );
	}

	public function test_falls_back_to_entry_own_food_when_plan_item_is_gone(): void {
		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'find_item' )->willReturn( null );
		$foods = $this->createMock( FoodCache::class );
		$foods->method( 'find' )->with( 5 )->willReturn( array( 'description' => 'Banana' ) );

		$result = ( new LogEntryLabelResolver( $plans, $foods, $this->createMock( RecipeRepository::class ) ) )->with_labels(
			array( $this->entry( 99, 5 ) )
		);

		self::assertSame( 'Banana', $result[0]['label'] );
	}

	public function test_label_is_null_when_nothing_resolves_and_foods_are_memoised(): void {
		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'find_item' )->willReturn( null );
		$foods = $this->createMock( FoodCache::class );
		$foods->expects( self::once() )->method( 'find' )->with( 5 )->willReturn( array( 'description' => 'Banana' ) );

		$result = ( new LogEntryLabelResolver( $plans, $foods, $this->createMock( RecipeRepository::class ) ) )->with_labels(
			array( $this->entry( null ), $this->entry( null, 5 ), $this->entry( null, 5 ) )
		);

		self::assertNull( $result[0]['label'] );
		self::assertSame( 'Banana', $result[1]['label'] );
		self::assertSame( 'Banana', $result[2]['label'] );
	}
}
