<?php
/**
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Tests\Unit\Email;

use Nutrio\Email\EmailTemplateRegistry;
use Nutrio\Tests\TestCase;

final class EmailTemplateRegistryTest extends TestCase {

	public function test_all_types_lists_exactly_the_five_known_types(): void {
		self::assertSame(
			array(
				'client_invite',
				'client_password_reset',
				'client_plan_assigned',
				'practitioner_client_added',
				'practitioner_daily_digest',
			),
			EmailTemplateRegistry::all_types()
		);
	}

	public function test_is_known_type_is_false_for_anything_else(): void {
		self::assertFalse( EmailTemplateRegistry::is_known_type( 'not_a_real_type' ) );
		self::assertTrue( EmailTemplateRegistry::is_known_type( 'client_invite' ) );
	}

	public function test_get_default_returns_a_subject_and_body(): void {
		$default = EmailTemplateRegistry::get_default( 'client_invite' );

		self::assertArrayHasKey( 'subject', $default );
		self::assertArrayHasKey( 'body', $default );
		self::assertNotSame( '', $default['subject'] );
		self::assertNotSame( '', $default['body'] );
	}

	public function test_get_audience_splits_practitioner_and_client_types(): void {
		self::assertSame( 'client', EmailTemplateRegistry::get_audience( 'client_invite' ) );
		self::assertSame( 'practitioner', EmailTemplateRegistry::get_audience( 'practitioner_client_added' ) );
	}

	public function test_practitioner_daily_digest_declares_a_report_table_tag(): void {
		self::assertArrayHasKey( 'report_table', EmailTemplateRegistry::get_tags( 'practitioner_daily_digest' ) );
	}
}
