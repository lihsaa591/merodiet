<?php
/**
 * The fixed catalog of every email MeroDiet sends.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Email;

/**
 * Deliberately static (same pattern as RoleRegistrar/PortalRewrite) —
 * this data never varies per request or per site, so it needs no
 * constructor, no DI, no instantiation at all. A new email type is
 * added by adding one entry here; every other class in this feature
 * (EmailTemplateService, the Settings REST routes, the frontend
 * builder) reads its list of types from all_types() rather than
 * hardcoding them a second time.
 */
final class EmailTemplateRegistry {

	/**
	 * Every email type this plugin knows how to send.
	 *
	 * @var array<string, array{audience: string, subject: string, body: string, tags: array<string, string>}>
	 */
	private const TYPES = array(
		'client_invite'             => array(
			'audience' => 'client',
			'subject'  => "You've been invited to your client portal",
			'body'     => "Hi {{client_first_name}},\n\n{{practitioner_name}} has invited you to your client portal at {{site_name}}. Click below to set your password and get started.\n\n<a href=\"{{reset_url}}\" style=\"display:inline-block;margin-top:4px;padding:12px 24px;background:#5b5fa6;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;\">Set your password</a>\n\nOr copy and paste this link into your browser:\n{{reset_url}}",
			'tags'     => array(
				'client_first_name' => "The client's first name",
				'client_last_name'  => "The client's last name",
				'practitioner_name' => "The practitioner's display name",
				'portal_url'        => 'Link to the client portal',
				'reset_url'         => 'Link for the client to set their password',
				'site_name'         => "This site's name",
			),
		),
		'client_password_reset'     => array(
			'audience' => 'client',
			'subject'  => 'Reset your client portal password',
			'body'     => "Hi {{client_first_name}},\n\nSomeone requested a password reset for your client portal account at {{site_name}}. Click below to choose a new password.\n\n<a href=\"{{reset_url}}\" style=\"display:inline-block;margin-top:4px;padding:12px 24px;background:#5b5fa6;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;\">Reset your password</a>\n\nOr copy and paste this link into your browser:\n{{reset_url}}\n\nIf you didn't request this, you can safely ignore this email.",
			'tags'     => array(
				'client_first_name' => "The client's first name",
				'reset_url'         => 'Link to reset the password',
				'site_name'         => "This site's name",
			),
		),
		'client_plan_assigned'      => array(
			'audience' => 'client',
			'subject'  => 'Your new meal plan is ready',
			'body'     => "Hi {{client_first_name}},\n\n{{practitioner_name}} just assigned you a new meal plan, \"{{plan_title}}\", running from {{start_date}} to {{end_date}}.\n\n<a href=\"{{portal_url}}\" style=\"display:inline-block;margin-top:4px;padding:12px 24px;background:#5b5fa6;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;\">View your plan</a>",
			'tags'     => array(
				'client_first_name' => "The client's first name",
				'practitioner_name' => "The practitioner's display name",
				'plan_title'        => "The plan's title",
				'start_date'        => "The plan's start date",
				'end_date'          => "The plan's end date",
				'portal_url'        => 'Link to the client portal',
			),
		),
		'practitioner_client_added' => array(
			'audience' => 'practitioner',
			'subject'  => 'New client added: {{client_first_name}} {{client_last_name}}',
			'body'     => "You just added {{client_first_name}} {{client_last_name}} to your roster.\n\nInvite status: {{invite_status}}",
			'tags'     => array(
				'practitioner_name' => 'Your display name',
				'client_first_name' => "The new client's first name",
				'client_last_name'  => "The new client's last name",
				'invite_status'     => 'Whether the portal invite was sent successfully',
			),
		),
		'practitioner_daily_digest' => array(
			'audience' => 'practitioner',
			'subject'  => 'Your client activity for {{report_date}}',
			'body'     => "Hi {{practitioner_name}},\n\nHere's how your clients did today ({{report_date}}):\n\n{{report_table}}",
			'tags'     => array(
				'practitioner_name' => 'Your display name',
				'report_date'       => "Today's date",
				'report_table'      => 'The generated per-client activity table (not directly editable)',
			),
		),
	);

	/**
	 * Whether $type is one of the five email types this plugin knows
	 * about — every write path (EmailTemplateService::save(), the
	 * PUT /email-templates/{type} route) must check this before
	 * touching storage, so an unknown type 404s instead of silently
	 * creating a new, unregistered option.
	 *
	 * @param string $type The email type key to check.
	 */
	public static function is_known_type( string $type ): bool {
		return array_key_exists( $type, self::TYPES );
	}

	/**
	 * The hardcoded default subject/body for a type — what a fresh
	 * install shows before a practitioner ever saves an override.
	 *
	 * @param string $type A known type (see is_known_type()).
	 *
	 * @return array{subject: string, body: string}
	 */
	public static function get_default( string $type ): array {
		return array(
			'subject' => self::TYPES[ $type ]['subject'],
			'body'    => self::TYPES[ $type ]['body'],
		);
	}

	/**
	 * The merge tags a type's subject/body may use, keyed by tag name
	 * with a human description — what the frontend builder's
	 * insert-tag buttons are generated from.
	 *
	 * @param string $type A known type (see is_known_type()).
	 *
	 * @return array<string, string>
	 */
	public static function get_tags( string $type ): array {
		return self::TYPES[ $type ]['tags'];
	}

	/**
	 * Which Settings tab a type belongs on.
	 *
	 * @param string $type A known type (see is_known_type()).
	 */
	public static function get_audience( string $type ): string {
		return self::TYPES[ $type ]['audience'];
	}

	/**
	 * Every known type, in declaration order — General (USDA key) stays
	 * untouched; this list is only the two new Settings tabs' content.
	 *
	 * @return array<int, string>
	 */
	public static function all_types(): array {
		return array_keys( self::TYPES );
	}
}
