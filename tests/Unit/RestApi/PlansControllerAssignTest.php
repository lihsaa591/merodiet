<?php
/**
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Tests\Unit\RestApi;

use Brain\Monkey\Functions;
use Nutrio\Email\EmailTemplateService;
use Nutrio\Email\Mailer;
use Nutrio\Nutrition\FoodCache;
use Nutrio\Nutrition\PlanNutrientResolver;
use Nutrio\Nutrition\RecipeNutrientResolver;
use Nutrio\Repositories\ClientRepository;
use Nutrio\Repositories\PlanRepository;
use Nutrio\Repositories\RecipeRepository;
use Nutrio\RestApi\PlansController;
use Nutrio\Tests\TestCase;
use WP_REST_Request;

/**
 * Proves the client_plan_assigned trigger: assigning a plan emails the
 * client with the plan's title and dates.
 *
 * Mailer (and its own EmailTemplateService collaborator) are `final`
 * and can't be doubled directly — a real Mailer is constructed here,
 * the WordPress functions it touches are stubbed, and the send is
 * observed by capturing wp_mail()'s arguments rather than asserting on
 * Mailer::send() directly (see ClientsControllerCreateTest for the
 * same pattern).
 */
final class PlansControllerAssignTest extends TestCase {

	public function test_assigning_a_plan_emails_the_client(): void {
		Functions\when( 'get_current_user_id' )->justReturn( 42 );
		Functions\when( 'get_option' )->justReturn( '' );
		Functions\when( 'get_theme_mod' )->justReturn( false );
		Functions\when( 'get_bloginfo' )->justReturn( 'Test Practice' );
		Functions\when( 'home_url' )->alias( static fn ( string $path = '' ) => 'https://example.test' . $path );

		$current_user               = $this->createMock( \WP_User::class );
		$current_user->display_name = 'Dr. Lee';
		Functions\when( 'wp_get_current_user' )->justReturn( $current_user );

		$captured = array();
		Functions\when( 'wp_mail' )->alias(
			static function ( $to, $subject, $body, $headers ) use ( &$captured ) {
				$captured = array(
					'to'      => $to,
					'subject' => $subject,
					'body'    => $body,
					'headers' => $headers,
				);

				return true;
			}
		);

		$plan_row = array(
			'id'                  => 5,
			'status'              => 'draft',
			'title'               => 'Test Plan',
			'start_date'          => '2026-10-01',
			'end_date'            => '2026-10-07',
			'practitioner_user_id' => 42,
		);

		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'find_for_practitioner' )->willReturn( $plan_row );
		$plans->method( 'find_overlapping_assigned_plan' )->willReturn( null );
		$plans->method( 'assign' )->willReturn( true );
		$plans->method( 'find' )->willReturn(
			array_merge( $plan_row, array( 'status' => 'assigned', 'nutrient_snapshot' => array() ) )
		);
		$plans->method( 'days_for_plan' )->willReturn( array() );

		$client_row = array( 'id' => 9, 'email' => 'client@example.test', 'first_name' => 'Ana' );
		$clients    = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_practitioner' )->willReturn( $client_row );

		$resolver = $this->createMock( PlanNutrientResolver::class );
		$resolver->method( 'calculate_plan_totals' )->willReturn( array() );

		$controller = new PlansController(
			$plans,
			$resolver,
			$clients,
			$this->createMock( FoodCache::class ),
			$this->createMock( RecipeRepository::class ),
			$this->createMock( RecipeNutrientResolver::class ),
			new Mailer( new EmailTemplateService() )
		);

		$request = new WP_REST_Request();
		$request->set_param( 'id', 5 );
		$request->set_param( 'client_id', 9 );

		$controller->assign_plan( $request );

		self::assertSame( 'client@example.test', $captured['to'] );
		self::assertStringContainsString( 'Test Plan', $captured['subject'] . $captured['body'] );
		self::assertStringContainsString( 'Ana', $captured['body'] );
		self::assertStringContainsString( 'Dr. Lee', $captured['body'] );
		self::assertStringContainsString( '2026-10-01', $captured['body'] );
		self::assertStringContainsString( '2026-10-07', $captured['body'] );
	}
}
