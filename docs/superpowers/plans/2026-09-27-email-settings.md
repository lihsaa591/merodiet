# Email Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let practitioners customize five transactional emails (subject + body, with merge tags via an insert-tag builder) across a Practitioner tab and a Client tab in the existing Settings screen, plus wire up the two new email triggers (plan-assigned, client-added) and a scheduled daily client-activity digest.

**Architecture:** A small `MeroDiet\Email` namespace (`EmailTemplateRegistry` — static defaults/tags; `EmailTemplateService` — per-type option storage + `{{tag}}` rendering; `Mailer` — HTML-wraps a rendered template and either returns it (for WP-core-triggered sends) or calls `wp_mail()` directly (for our own new triggers)). Five email types are wired at their real trigger points: two existing (invite, password reset — both currently share one undifferentiated WP-core email, split via a short-lived static flag) and three new (plan assigned, client added, and a WP-Cron daily digest).

**Tech Stack:** PHP 8.1, WordPress core APIs (`wp_mail`, `wp_schedule_event`, options API), League/container DI (existing `bind_recursively` auto-wiring), PHPUnit + Brain Monkey, React/TypeScript with `@wordpress/element` + `@wordpress/api-fetch` (existing frontend stack, no new libraries).

**Spec:** `docs/superpowers/specs/2026-09-27-email-settings-design.md`

## Global Constraints

- Per-type option storage: each email type is its own WordPress option (`merodiet_email_{type}`), never a single shared array — see spec's "Storage" section for the WooCommerce-precedent rationale. Every one of these options, plus the two digest options, is created with `autoload = false`.
- `EmailTemplateService`'s public API is type-keyed (`get($type)`/`save($type, ...)`) — callers never see the storage layout.
- No raw HTML/CSS template editor is built. "Email styles" is a locked entry using the existing `ProUpsellModal` pattern (`Sidebar.tsx`'s "Analytics" entry) — no backend flag, no license check.
- The daily digest is scheduled-only, one global (not per-practitioner) send time — multi-practitioner clinics are an explicit v1 non-goal.
- New capability `manage_merodiet_settings`, added to `RoleRegistrar::PRACTITIONER_CAPS`, gates every new route in this plan. The existing `/settings/usda-key` routes are untouched (stay on `manage_merodiet_foods`).
- Every merge-tag context value is HTML-escaped at substitution time by default — the one exception (`report_table`, pre-built trusted HTML) is passed wrapped in a new `RawHtml` value object, never as a plain string, so the exception is explicit at every call site rather than a silent special case inside the renderer.
- PHP file style: `declare( strict_types=1 );`, tab indentation, one class per file, matching every existing file in `includes/`.

## Review Focus

- **Unknown `type` on `PUT /email-templates/{type}`** — must 404 (`merodiet_unknown_email_type`), never silently create a new, unregistered option. Covered in Task 5.
- **Malformed `send_time` on `PUT /email-digest`** — must 400, never reach `wp_schedule_event()` with garbage. Covered in Task 6.
- **A genuine password-reset request right after an invite** — `ClientInviteService`'s "sending an invite" flag must reset to `false` even when `retrieve_password()` itself returns a `WP_Error` mid-`invite()`, via `try/finally`, not a bare set-then-unset, so a failed invite never leaves the *next*, unrelated reset request in the same PHP process reading the invite copy. Covered in Task 7.
- **A merge-tag value containing markup** (e.g. a client's first name typed as `<b>Al</b>`) must render as literal text in the email, not break the surrounding HTML — while `report_table`, the one deliberately-trusted tag, must render as real HTML, not escaped into visible tags. Covered in Task 2 and Task 11.
- **A practitioner with zero clients** must never receive an empty daily digest email. Covered in Task 11.

---

### Task 1: EmailTemplateRegistry

**Files:**
- Create: `includes/Email/EmailTemplateRegistry.php`
- Test: `tests/Unit/Email/EmailTemplateRegistryTest.php`

**Interfaces:**
- Consumes: nothing (pure static data).
- Produces: `EmailTemplateRegistry::is_known_type(string $type): bool`, `EmailTemplateRegistry::get_default(string $type): array{subject: string, body: string}`, `EmailTemplateRegistry::get_tags(string $type): array<string, string>` (tag name => human description), `EmailTemplateRegistry::get_audience(string $type): string` (`'practitioner'` or `'client'`), `EmailTemplateRegistry::all_types(): array<int, string>`. Every later task that touches an email type uses these five methods and no other entry point into the registry.

- [ ] **Step 1: Write the failing test**

```php
<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit\Email;

use MeroDiet\Email\EmailTemplateRegistry;
use MeroDiet\Tests\TestCase;

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit tests/Unit/Email/EmailTemplateRegistryTest.php`
Expected: FAIL — `Class "MeroDiet\Email\EmailTemplateRegistry" not found`.

- [ ] **Step 3: Write the implementation**

```php
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
	 * @var array<string, array{audience: string, subject: string, body: string, tags: array<string, string>}>
	 */
	private const TYPES = array(
		'client_invite'             => array(
			'audience' => 'client',
			'subject'  => "You've been invited to your client portal",
			'body'     => "Hi {{client_first_name}},\n\n{{practitioner_name}} has invited you to your client portal at {{site_name}}. Set your password here: {{portal_url}}",
			'tags'     => array(
				'client_first_name' => "The client's first name",
				'client_last_name'  => "The client's last name",
				'practitioner_name' => "The practitioner's display name",
				'portal_url'        => 'Link to the client portal',
				'site_name'         => "This site's name",
			),
		),
		'client_password_reset'     => array(
			'audience' => 'client',
			'subject'  => 'Reset your client portal password',
			'body'     => "Hi {{client_first_name}},\n\nSomeone requested a password reset for your client portal account at {{site_name}}. Reset it here: {{reset_url}}\n\nIf this wasn't you, you can ignore this email.",
			'tags'     => array(
				'client_first_name' => "The client's first name",
				'reset_url'         => 'Link to reset the password',
				'site_name'         => "This site's name",
			),
		),
		'client_plan_assigned'      => array(
			'audience' => 'client',
			'subject'  => 'Your new meal plan is ready',
			'body'     => "Hi {{client_first_name}},\n\n{{practitioner_name}} just assigned you a new meal plan, \"{{plan_title}}\", running from {{start_date}} to {{end_date}}. View it in your portal: {{portal_url}}",
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit tests/Unit/Email/EmailTemplateRegistryTest.php`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add includes/Email/EmailTemplateRegistry.php tests/Unit/Email/EmailTemplateRegistryTest.php
git commit -m "feat: add EmailTemplateRegistry, the fixed catalog of MeroDiet's emails"
```

---

### Task 2: EmailTemplateService + RawHtml

**Files:**
- Create: `includes/Email/RawHtml.php`
- Create: `includes/Email/EmailTemplateService.php`
- Test: `tests/Unit/Email/EmailTemplateServiceTest.php`

**Interfaces:**
- Consumes: `EmailTemplateRegistry::is_known_type()`, `::get_default()` (Task 1).
- Produces: `EmailTemplateService::get(string $type): array{subject: string, body: string}`, `::save(string $type, string $subject, string $body): void` (throws `InvalidArgumentException` for an unknown `$type`), `::render(string $type, array<string, string|RawHtml> $context): array{subject: string, body: string}`. `RawHtml` is a one-method value object (`__construct(string $html)`, `__toString(): string`) — later tasks pass it for the one context value that must NOT be HTML-escaped (`report_table` in Task 11); every other context value is a plain string and gets escaped automatically.

- [ ] **Step 1: Write the failing test**

```php
<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit\Email;

use Brain\Monkey\Functions;
use InvalidArgumentException;
use MeroDiet\Email\EmailTemplateService;
use MeroDiet\Email\RawHtml;
use MeroDiet\Tests\TestCase;

final class EmailTemplateServiceTest extends TestCase {

	public function test_get_falls_back_to_the_registry_default_when_nothing_is_saved(): void {
		Functions\when( 'get_option' )->justReturn( array() );

		$service = new EmailTemplateService();
		$result  = $service->get( 'client_invite' );

		self::assertStringContainsString( 'invited', $result['subject'] );
	}

	public function test_save_then_get_round_trips_through_the_option(): void {
		$stored = null;

		Functions\when( 'add_option' )->justReturn( true );
		Functions\when( 'sanitize_text_field' )->returnArg( 1 );
		Functions\when( 'wp_kses_post' )->returnArg( 1 );
		Functions\when( 'update_option' )->alias(
			static function ( string $name, $value ) use ( &$stored ) {
				$stored = $value;
				return true;
			}
		);
		Functions\when( 'get_option' )->alias(
			static fn ( string $name, $default = false ) => $stored ?? $default
		);

		$service = new EmailTemplateService();
		$service->save( 'client_invite', 'Custom subject', 'Custom body' );

		$result = $service->get( 'client_invite' );

		self::assertSame( 'Custom subject', $result['subject'] );
		self::assertSame( 'Custom body', $result['body'] );
	}

	public function test_save_rejects_an_unknown_type(): void {
		$this->expectException( InvalidArgumentException::class );

		( new EmailTemplateService() )->save( 'not_a_real_type', 'x', 'y' );
	}

	public function test_render_substitutes_tags_and_escapes_plain_string_context_values(): void {
		Functions\when( 'get_option' )->justReturn( array() );
		Functions\when( 'esc_html' )->alias( static fn ( string $text ) => htmlspecialchars( $text, ENT_QUOTES ) );

		$service = new EmailTemplateService();
		$result  = $service->render(
			'client_invite',
			array(
				'client_first_name' => '<b>Al</b>',
				'practitioner_name' => 'Dr. Lee',
				'portal_url'        => 'https://example.test/portal',
				'site_name'         => 'Test Site',
				'client_last_name'  => '',
			)
		);

		self::assertStringContainsString( '&lt;b&gt;Al&lt;/b&gt;', $result['body'] );
		self::assertStringNotContainsString( '<b>Al</b>', $result['body'] );
	}

	public function test_render_leaves_a_rawhtml_context_value_unescaped(): void {
		Functions\when( 'get_option' )->justReturn( array() );
		Functions\when( 'esc_html' )->alias( static fn ( string $text ) => htmlspecialchars( $text, ENT_QUOTES ) );

		$service = new EmailTemplateService();
		$result  = $service->render(
			'practitioner_daily_digest',
			array(
				'practitioner_name' => 'Dr. Lee',
				'report_date'       => '2026-09-27',
				'report_table'      => new RawHtml( '<table><tr><td>Ana</td></tr></table>' ),
			)
		);

		self::assertStringContainsString( '<table><tr><td>Ana</td></tr></table>', $result['body'] );
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit tests/Unit/Email/EmailTemplateServiceTest.php`
Expected: FAIL — `Class "MeroDiet\Email\EmailTemplateService" not found`.

- [ ] **Step 3: Write the implementation**

```php
<?php
/**
 * A merge-tag value that must render as raw HTML, never escaped.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Email;

/**
 * Wraps a pre-built, trusted HTML fragment (currently only
 * DigestMailer's per-client report table) so EmailTemplateService::render()
 * can tell it apart from an ordinary string context value, which is
 * always HTML-escaped. Passing a plain string is the safe default;
 * this class exists so the one deliberate exception is explicit at its
 * call site rather than a silent special case inside the renderer.
 */
final class RawHtml {

	/**
	 * @param string $html Pre-built, trusted HTML — never end-user input.
	 */
	public function __construct( private readonly string $html ) {}

	public function __toString(): string {
		return $this->html;
	}
}
```

```php
<?php
/**
 * Per-type storage and merge-tag rendering for MeroDiet's emails.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Email;

use InvalidArgumentException;

/**
 * Each type is its own WordPress option (merodiet_email_{type}), not one
 * shared array — see the design spec's "Storage" section for why
 * (WooCommerce precedent, future add-on extensibility). Callers never
 * see that storage layout: every public method here is keyed by type.
 */
final class EmailTemplateService {

	/**
	 * The effective (saved-override-or-default) subject/body for a type.
	 *
	 * @param string $type A known type (see EmailTemplateRegistry::is_known_type()).
	 *
	 * @return array{subject: string, body: string}
	 */
	public function get( string $type ): array {
		$default = EmailTemplateRegistry::get_default( $type );
		$saved   = get_option( self::option_name( $type ), array() );

		return array(
			'subject' => (string) ( $saved['subject'] ?? $default['subject'] ),
			'body'    => (string) ( $saved['body'] ?? $default['body'] ),
		);
	}

	/**
	 * Save a type's subject/body override.
	 *
	 * @param string $type    A known type (see EmailTemplateRegistry::is_known_type()).
	 * @param string $subject The new subject line.
	 * @param string $body    The new body — merge tags stay literal ({{tag}}) here; substitution happens in render().
	 *
	 * @throws InvalidArgumentException When $type isn't one EmailTemplateRegistry knows.
	 */
	public function save( string $type, string $subject, string $body ): void {
		if ( ! EmailTemplateRegistry::is_known_type( $type ) ) {
			throw new InvalidArgumentException( "Unknown email template type: {$type}" );
		}

		$value = array(
			'subject' => sanitize_text_field( $subject ),
			'body'    => wp_kses_post( $body ),
		);

		$option = self::option_name( $type );

		// add_option() no-ops if the option already exists (leaving its
		// existing autoload setting alone) and otherwise creates it with
		// autoload=false — this is the standard idiom for guaranteeing a
		// non-autoloaded option regardless of which WordPress version's
		// update_option() third-parameter support is in play.
		add_option( $option, $value, '', false );
		update_option( $option, $value );
	}

	/**
	 * Fill a type's saved-or-default subject/body with real values.
	 * Every context value is HTML-escaped by default — pass a RawHtml
	 * instance for the one kind of value (a pre-built report table)
	 * that must render as actual markup instead.
	 *
	 * @param string                          $type    A known type.
	 * @param array<string, string|RawHtml>   $context Tag name (without braces) => value.
	 *
	 * @return array{subject: string, body: string}
	 */
	public function render( string $type, array $context ): array {
		$template     = $this->get( $type );
		$replacements = array();

		foreach ( $context as $tag => $value ) {
			$replacements[ '{{' . $tag . '}}' ] = $value instanceof RawHtml
				? (string) $value
				: esc_html( (string) $value );
		}

		return array(
			'subject' => strtr( $template['subject'], $replacements ),
			'body'    => strtr( $template['body'], $replacements ),
		);
	}

	/**
	 * @param string $type A known type.
	 */
	private static function option_name( string $type ): string {
		return "merodiet_email_{$type}";
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit tests/Unit/Email/EmailTemplateServiceTest.php`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add includes/Email/RawHtml.php includes/Email/EmailTemplateService.php tests/Unit/Email/EmailTemplateServiceTest.php
git commit -m "feat: add EmailTemplateService (per-type storage + tag rendering)"
```

---

### Task 3: Mailer

**Files:**
- Create: `includes/Email/Mailer.php`
- Test: `tests/Unit/Email/MailerTest.php`

**Interfaces:**
- Consumes: `EmailTemplateService::render()` (Task 2).
- Produces: `Mailer::__construct(EmailTemplateService $templates)`, `Mailer::render_html(string $type, array $context): array{subject: string, body: string}` (rendered + HTML-wrapped, no send — this is what PortalPage's WP-core-triggered filters call in Task 8, since core does the actual `wp_mail()` there, not us), `Mailer::send(string $type, string $to, array $context): bool` (render_html() + `wp_mail()` — what every *new* trigger in Tasks 9/10/11 calls).

- [ ] **Step 1: Write the failing test**

```php
<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit\Email;

use Brain\Monkey\Functions;
use MeroDiet\Email\EmailTemplateService;
use MeroDiet\Email\Mailer;
use MeroDiet\Tests\TestCase;

final class MailerTest extends TestCase {

	public function test_render_html_wraps_the_rendered_body_with_the_site_name(): void {
		Functions\when( 'get_option' )->justReturn( array() );
		Functions\when( 'get_theme_mod' )->justReturn( false );
		Functions\when( 'get_bloginfo' )->justReturn( 'Test Practice' );

		$mailer = new Mailer( new EmailTemplateService() );
		$result = $mailer->render_html( 'client_invite', array( 'client_first_name' => 'Ana' ) );

		self::assertStringContainsString( 'Test Practice', $result['body'] );
		self::assertStringContainsString( 'Ana', $result['body'] );
	}

	public function test_send_calls_wp_mail_with_html_content_type(): void {
		Functions\when( 'get_option' )->justReturn( array() );
		Functions\when( 'get_theme_mod' )->justReturn( false );
		Functions\when( 'get_bloginfo' )->justReturn( 'Test Practice' );

		$captured = array();
		Functions\when( 'wp_mail' )->alias(
			static function ( $to, $subject, $body, $headers ) use ( &$captured ) {
				$captured = array( $to, $subject, $body, $headers );
				return true;
			}
		);

		$mailer = new Mailer( new EmailTemplateService() );
		$result = $mailer->send( 'client_invite', 'client@example.test', array( 'client_first_name' => 'Ana' ) );

		self::assertTrue( $result );
		self::assertSame( 'client@example.test', $captured[0] );
		self::assertContains( 'Content-Type: text/html; charset=UTF-8', $captured[3] );
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit tests/Unit/Email/MailerTest.php`
Expected: FAIL — `Class "MeroDiet\Email\Mailer" not found`.

- [ ] **Step 3: Write the implementation**

```php
<?php
/**
 * Wraps a rendered email template in one shared HTML skeleton and,
 * for MeroDiet's own new triggers, sends it.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Email;

/**
 * render_html() (rendered content only, no send) exists separately
 * from send() because two of the five email types (client_invite,
 * client_password_reset) are triggered by WordPress core itself via
 * retrieve_password() — core calls wp_mail() internally, so PortalPage's
 * filter callbacks must return a string, never call wp_mail() a second
 * time. Every other type is triggered by our own code, which calls
 * send() directly.
 */
final class Mailer {

	public function __construct( private readonly EmailTemplateService $templates ) {}

	/**
	 * Render a type and wrap its body in the shared HTML skeleton
	 * (site logo, accent header band) — used directly by PortalPage's
	 * retrieve_password_message/retrieve_password_title filters, and
	 * internally by send().
	 *
	 * @param string                        $type    A known email type.
	 * @param array<string, string|RawHtml> $context Merge-tag context — see EmailTemplateService::render().
	 *
	 * @return array{subject: string, body: string}
	 */
	public function render_html( string $type, array $context ): array {
		$rendered = $this->templates->render( $type, $context );

		return array(
			'subject' => $rendered['subject'],
			'body'    => self::wrap_in_skeleton( $rendered['body'] ),
		);
	}

	/**
	 * Render, wrap, and actually send. Only called by triggers this
	 * plugin itself owns (never the two WP-core-triggered types — see
	 * class docblock).
	 *
	 * @param string                        $type    A known email type.
	 * @param string                        $to      Recipient email address.
	 * @param array<string, string|RawHtml> $context Merge-tag context.
	 */
	public function send( string $type, string $to, array $context ): bool {
		$rendered = $this->render_html( $type, $context );

		return wp_mail(
			$to,
			$rendered['subject'],
			$rendered['body'],
			array( 'Content-Type: text/html; charset=UTF-8' )
		);
	}

	/**
	 * @param string $body Already-rendered, already-escaped HTML body content.
	 */
	private static function wrap_in_skeleton( string $body ): string {
		return sprintf(
			'<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;max-width:480px;margin:0 auto;">' .
			'<div style="background:#5b5fa6;padding:20px;text-align:center;border-radius:8px 8px 0 0;">%1$s</div>' .
			'<div style="background:#ffffff;padding:24px;border:1px solid #e7e6ea;border-top:none;border-radius:0 0 8px 8px;color:#26262a;white-space:pre-line;">%2$s</div>' .
			'</div>',
			self::site_logo_html(),
			$body
		);
	}

	/**
	 * The site's custom logo if set, otherwise its name as plain text —
	 * an email client can't run this plugin's own CSS/tokens, so
	 * #5b5fa6 above is --sage's value, inlined literally rather than
	 * referenced.
	 */
	private static function site_logo_html(): string {
		$logo_id = get_theme_mod( 'custom_logo' );

		if ( $logo_id ) {
			return (string) wp_get_attachment_image(
				(int) $logo_id,
				'medium',
				false,
				array( 'style' => 'max-height:40px;' )
			);
		}

		return '<span style="color:#ffffff;font-weight:600;">' . esc_html( get_bloginfo( 'name' ) ) . '</span>';
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit tests/Unit/Email/MailerTest.php`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add includes/Email/Mailer.php tests/Unit/Email/MailerTest.php
git commit -m "feat: add Mailer (HTML skeleton + send)"
```

---

### Task 4: New capability + AppServiceProvider bindings

**Files:**
- Modify: `includes/Roles/RoleRegistrar.php`
- Modify: `includes/Providers/AppServiceProvider.php`

**Interfaces:**
- Consumes: `EmailTemplateService` (Task 2), `Mailer` (Task 3).
- Produces: the `manage_merodiet_settings` capability (synced to `practitioner` and `administrator` automatically — `DatabaseServiceProvider` already re-runs `RoleRegistrar::register()` on every migration catch-up, so no separate upgrade step is needed for existing installs). `EmailTemplateService::class` and `Mailer::class` bound as shared services in the container, so every later task's controller/class can list them as a config dependency (`MeroDiet\Email\Mailer::class`) and get them auto-wired via `RestApiServiceProvider::bind_recursively()`, or reference them directly for a manually-wired class like `PortalPage`.

- [ ] **Step 1: Modify `RoleRegistrar::PRACTITIONER_CAPS`**

```php
	private const PRACTITIONER_CAPS = array(
		'read',
		'manage_merodiet_clients',
		'manage_merodiet_recipes',
		'manage_merodiet_plans',
		'manage_merodiet_foods',
		'manage_merodiet_settings',
	);
```

- [ ] **Step 2: Modify `AppServiceProvider::register()`**

```php
<?php
/**
 * General application bindings.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Providers;

use League\Container\Container;
use MeroDiet\Clients\ClientInviteService;
use MeroDiet\Email\EmailTemplateService;
use MeroDiet\Email\Mailer;
use MeroDiet\Repositories\ClientRepository;

/**
 * Home for bindings that don't belong to a more specific provider.
 */
final class AppServiceProvider extends AbstractServiceProvider {

	/**
	 * Register ClientInviteService and the email-sending services every
	 * later task's controllers depend on.
	 *
	 * @param Container $container The DI container.
	 */
	public function register( Container $container ): void {
		$container->add( ClientInviteService::class )->addArgument( ClientRepository::class )->setShared( true );

		$container->add( EmailTemplateService::class )->setShared( true );
		$container->add( Mailer::class )->setShared( true )->addArgument( EmailTemplateService::class );
	}
}
```

- [ ] **Step 3: Run the full suite to confirm nothing broke**

Run: `vendor/bin/phpunit`
Expected: PASS (all existing + new tests) — this task adds no new tests of its own (pure wiring, exercised end-to-end by later tasks' controller tests).

- [ ] **Step 4: Commit**

```bash
git add includes/Roles/RoleRegistrar.php includes/Providers/AppServiceProvider.php
git commit -m "feat: add manage_merodiet_settings capability and bind EmailTemplateService/Mailer"
```

---

### Task 5: SettingsController — email-templates routes

**Files:**
- Modify: `includes/RestApi/SettingsController.php`
- Modify: `config/app.php:56` (the `SettingsController::class => array()` line)
- Test: `tests/Unit/RestApi/SettingsControllerTest.php`

**Interfaces:**
- Consumes: `EmailTemplateService::get()`/`::save()` (Task 2), `EmailTemplateRegistry::all_types()`/`::get_audience()`/`::get_tags()` (Task 1).
- Produces: `GET /merodiet/v1/settings/email-templates`, `PUT /merodiet/v1/settings/email-templates/{type}` — both gated by `manage_merodiet_settings`.

- [ ] **Step 1: Write the failing test**

```php
<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit\RestApi;

use Brain\Monkey\Functions;
use MeroDiet\Email\EmailTemplateService;
use MeroDiet\RestApi\SettingsController;
use MeroDiet\Tests\TestCase;
use WP_REST_Request;

final class SettingsControllerTest extends TestCase {

	public function test_get_email_templates_lists_all_five_known_types(): void {
		Functions\when( 'get_option' )->justReturn( array() );

		$controller = new SettingsController( new EmailTemplateService() );
		$response   = $controller->get_email_templates();

		self::assertCount( 5, $response->get_data() );
	}

	public function test_update_email_template_saves_and_returns_the_new_values(): void {
		$stored = null;

		Functions\when( 'add_option' )->justReturn( true );
		Functions\when( 'sanitize_text_field' )->returnArg( 1 );
		Functions\when( 'wp_kses_post' )->returnArg( 1 );
		Functions\when( 'update_option' )->alias(
			static function ( string $name, $value ) use ( &$stored ) {
				$stored = $value;
				return true;
			}
		);
		Functions\when( 'get_option' )->alias(
			static fn ( string $name, $default = false ) => $stored ?? $default
		);

		$request = new WP_REST_Request();
		$request->set_param( 'type', 'client_invite' );
		$request->set_param( 'subject', 'New subject' );
		$request->set_param( 'body', 'New body' );

		$controller = new SettingsController( new EmailTemplateService() );
		$response   = $controller->update_email_template( $request );

		self::assertSame( 'New subject', $response->get_data()['subject'] );
	}

	public function test_update_email_template_404s_for_an_unknown_type(): void {
		$request = new WP_REST_Request();
		$request->set_param( 'type', 'not_a_real_type' );
		$request->set_param( 'subject', 'x' );
		$request->set_param( 'body', 'y' );

		$controller = new SettingsController( new EmailTemplateService() );
		$response   = $controller->update_email_template( $request );

		self::assertSame( 404, $response->get_error_data()['status'] );
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit tests/Unit/RestApi/SettingsControllerTest.php`
Expected: FAIL — `Too few arguments to function ...SettingsController::__construct()`.

- [ ] **Step 3: Modify `SettingsController`**

Add these imports at the top, alongside the existing ones:

```php
use MeroDiet\Email\EmailTemplateRegistry;
use MeroDiet\Email\EmailTemplateService;
```

Add a constructor (this class had none before) and the four new methods, leaving `get_usda_key()`/`update_usda_key()`/`describe()` exactly as they are:

```php
	/**
	 * @param EmailTemplateService $templates Per-type email template storage.
	 */
	public function __construct( private readonly EmailTemplateService $templates ) {}
```

Add to the end of `register_routes()`, after the existing two `usda-key` routes:

```php
		$this->register_route(
			'/email-templates',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'get_email_templates' ),
			),
			required_capability: 'manage_merodiet_settings'
		);

		$this->register_route(
			'/email-templates/(?P<type>[a-z_]+)',
			array(
				'methods'  => WP_REST_Server::EDITABLE,
				'callback' => array( $this, 'update_email_template' ),
				'args'     => array(
					'subject' => array(
						'required' => true,
						'type'     => 'string',
					),
					'body'    => array(
						'required' => true,
						'type'     => 'string',
					),
				),
			),
			required_capability: 'manage_merodiet_settings'
		);
```

Add the two new methods anywhere after `update_usda_key()`:

```php
	/**
	 * GET /settings/email-templates — every known type's effective
	 * subject/body, its allowed merge tags, and which Settings tab it
	 * belongs on.
	 */
	public function get_email_templates(): WP_REST_Response {
		$types = array();

		foreach ( EmailTemplateRegistry::all_types() as $type ) {
			$template = $this->templates->get( $type );

			$types[] = array(
				'type'     => $type,
				'audience' => EmailTemplateRegistry::get_audience( $type ),
				'subject'  => $template['subject'],
				'body'     => $template['body'],
				'tags'     => EmailTemplateRegistry::get_tags( $type ),
			);
		}

		return $this->success( $types );
	}

	/**
	 * PUT /settings/email-templates/{type} — save one type's subject/body override.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function update_email_template( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$type = (string) $request->get_param( 'type' );

		if ( ! EmailTemplateRegistry::is_known_type( $type ) ) {
			return $this->error( 'merodiet_unknown_email_type', __( 'Unknown email template.', 'merodiet' ), 404 );
		}

		$this->templates->save(
			$type,
			(string) $request->get_param( 'subject' ),
			(string) $request->get_param( 'body' )
		);

		$saved = $this->templates->get( $type );

		return $this->success(
			array(
				'type'    => $type,
				'subject' => $saved['subject'],
				'body'    => $saved['body'],
			)
		);
	}
```

Add `use WP_Error;` to the top-of-file imports if it isn't already there (check first — the existing file only imports `WP_REST_Request`, `WP_REST_Response`, `WP_REST_Server`).

- [ ] **Step 4: Update `config/app.php`**

Change:

```php
			\MeroDiet\RestApi\SettingsController::class    => array(),
```

to:

```php
			\MeroDiet\RestApi\SettingsController::class    => array( \MeroDiet\Email\EmailTemplateService::class ),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `vendor/bin/phpunit tests/Unit/RestApi/SettingsControllerTest.php`
Expected: PASS (3 tests).

- [ ] **Step 6: Run the full suite**

Run: `vendor/bin/phpunit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add includes/RestApi/SettingsController.php config/app.php tests/Unit/RestApi/SettingsControllerTest.php
git commit -m "feat: add GET/PUT /settings/email-templates routes"
```

---

### Task 6: DigestScheduler + SettingsController — email-digest routes

**Files:**
- Create: `includes/Email/DigestScheduler.php`
- Modify: `includes/RestApi/SettingsController.php`
- Test: `tests/Unit/Email/DigestSchedulerTest.php`
- Test: `tests/Unit/RestApi/SettingsControllerTest.php` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: `DigestScheduler::CRON_HOOK` (string constant, `'merodiet_daily_digest'` — Task 11's cron handler and Task 12's `Deactivation` both reference this exact constant, never a hardcoded string), `DigestScheduler::reschedule(): void`. `GET /merodiet/v1/settings/email-digest`, `PUT /merodiet/v1/settings/email-digest`.

- [ ] **Step 1: Write the failing test**

```php
<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit\Email;

use Brain\Monkey\Functions;
use DateTimeZone;
use MeroDiet\Email\DigestScheduler;
use MeroDiet\Tests\TestCase;

final class DigestSchedulerTest extends TestCase {

	public function test_reschedule_clears_the_old_hook_and_does_nothing_else_when_disabled(): void {
		Functions\when( 'get_option' )->justReturn( false );

		$cleared = false;
		Functions\when( 'wp_clear_scheduled_hook' )->alias(
			static function () use ( &$cleared ) {
				$cleared = true;
			}
		);
		Functions\expect( 'wp_schedule_event' )->never();

		DigestScheduler::reschedule();

		self::assertTrue( $cleared );
	}

	public function test_reschedule_schedules_tomorrow_when_the_configured_time_already_passed_today(): void {
		Functions\when( 'wp_clear_scheduled_hook' )->justReturn( null );
		Functions\when( 'wp_timezone' )->justReturn( new DateTimeZone( 'UTC' ) );
		Functions\when( 'get_option' )->alias(
			static function ( string $name, $default = false ) {
				if ( 'merodiet_digest_enabled' === $name ) {
					return true;
				}
				if ( 'merodiet_digest_time' === $name ) {
					return '00:01'; // Almost certainly already passed "today" in any real run.
				}
				return $default;
			}
		);

		$scheduled_for = null;
		Functions\when( 'wp_schedule_event' )->alias(
			static function ( $timestamp, $recurrence, $hook ) use ( &$scheduled_for ) {
				$scheduled_for = $timestamp;
			}
		);

		DigestScheduler::reschedule();

		self::assertIsInt( $scheduled_for );
		self::assertGreaterThan( time(), $scheduled_for );
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit tests/Unit/Email/DigestSchedulerTest.php`
Expected: FAIL — `Class "MeroDiet\Email\DigestScheduler" not found`.

- [ ] **Step 3: Write the implementation**

```php
<?php
/**
 * Schedules (or clears) the daily practitioner digest's WP-Cron event.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Email;

use DateTimeImmutable;

/**
 * WP-Cron has no native "run at this specific wall-clock time" concept
 * — wp_schedule_event()'s recurrence just repeats every N seconds from
 * whenever it was first scheduled. To honor a practitioner-chosen
 * time-of-day, this always clears any existing scheduled event first,
 * then (if enabled) computes the next real occurrence of that time in
 * the site's own timezone (today if it hasn't passed yet, otherwise
 * tomorrow) and schedules from there — 'daily' then keeps landing at
 * the same wall-clock time every day after.
 */
final class DigestScheduler {

	public const CRON_HOOK = 'merodiet_daily_digest';

	/**
	 * Called whenever merodiet_digest_enabled/merodiet_digest_time is
	 * saved (SettingsController::update_email_digest()), and once from
	 * Activation::activate().
	 */
	public static function reschedule(): void {
		wp_clear_scheduled_hook( self::CRON_HOOK );

		if ( ! (bool) get_option( 'merodiet_digest_enabled', false ) ) {
			return;
		}

		$time = (string) get_option( 'merodiet_digest_time', '20:00' );
		$now  = new DateTimeImmutable( 'now', wp_timezone() );

		$target = DateTimeImmutable::createFromFormat(
			'Y-m-d H:i',
			$now->format( 'Y-m-d' ) . ' ' . $time,
			wp_timezone()
		);

		if ( false === $target ) {
			return; // Malformed time — SettingsController validates this before saving, but nothing safe to schedule if it somehow got here anyway.
		}

		if ( $target <= $now ) {
			$target = $target->modify( '+1 day' );
		}

		wp_schedule_event( $target->getTimestamp(), 'daily', self::CRON_HOOK );
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit tests/Unit/Email/DigestSchedulerTest.php`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the email-digest routes — write the failing tests first**

Append to `tests/Unit/RestApi/SettingsControllerTest.php`:

```php
	public function test_get_email_digest_returns_defaults_when_nothing_saved(): void {
		Functions\when( 'get_option' )->alias(
			static function ( string $name, $default = false ) {
				return $default;
			}
		);

		$controller = new SettingsController( new EmailTemplateService() );
		$response   = $controller->get_email_digest();

		self::assertSame(
			array(
				'enabled'   => false,
				'send_time' => '20:00',
			),
			$response->get_data()
		);
	}

	public function test_update_email_digest_rejects_a_malformed_time(): void {
		$request = new WP_REST_Request();
		$request->set_param( 'enabled', true );
		$request->set_param( 'send_time', 'not a time' );

		$controller = new SettingsController( new EmailTemplateService() );
		$response   = $controller->update_email_digest( $request );

		self::assertSame( 400, $response->get_error_data()['status'] );
	}

	public function test_update_email_digest_saves_and_reschedules_on_a_valid_time(): void {
		Functions\when( 'add_option' )->justReturn( true );
		Functions\when( 'update_option' )->justReturn( true );
		Functions\when( 'get_option' )->justReturn( true );
		Functions\when( 'wp_clear_scheduled_hook' )->justReturn( null );
		Functions\when( 'wp_timezone' )->justReturn( new \DateTimeZone( 'UTC' ) );
		Functions\when( 'wp_schedule_event' )->justReturn( true );

		$request = new WP_REST_Request();
		$request->set_param( 'enabled', true );
		$request->set_param( 'send_time', '08:30' );

		$controller = new SettingsController( new EmailTemplateService() );
		$response   = $controller->update_email_digest( $request );

		self::assertSame( '08:30', $response->get_data()['send_time'] );
	}
```

Run: `vendor/bin/phpunit tests/Unit/RestApi/SettingsControllerTest.php`
Expected: FAIL — `Call to undefined method ...SettingsController::get_email_digest()`.

- [ ] **Step 6: Add the routes and methods to `SettingsController`**

Add `use MeroDiet\Email\DigestScheduler;` to the imports. Append to `register_routes()`:

```php
		$this->register_route(
			'/email-digest',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'get_email_digest' ),
			),
			required_capability: 'manage_merodiet_settings'
		);

		$this->register_route(
			'/email-digest',
			array(
				'methods'  => WP_REST_Server::EDITABLE,
				'callback' => array( $this, 'update_email_digest' ),
				'args'     => array(
					'enabled'   => array(
						'required' => true,
						'type'     => 'boolean',
					),
					'send_time' => array(
						'required' => true,
						'type'     => 'string',
					),
				),
			),
			required_capability: 'manage_merodiet_settings'
		);
```

Add the two methods:

```php
	/**
	 * GET /settings/email-digest — whether the daily digest is enabled
	 * and what time it's sent.
	 */
	public function get_email_digest(): WP_REST_Response {
		return $this->success(
			array(
				'enabled'   => (bool) get_option( 'merodiet_digest_enabled', false ),
				'send_time' => (string) get_option( 'merodiet_digest_time', '20:00' ),
			)
		);
	}

	/**
	 * PUT /settings/email-digest — save enabled/send_time and reschedule the cron event.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function update_email_digest( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$send_time = (string) $request->get_param( 'send_time' );

		if ( 1 !== preg_match( '/^([01]\d|2[0-3]):[0-5]\d$/', $send_time ) ) {
			return $this->error( 'merodiet_invalid_time', __( 'Send time must be in HH:MM (24-hour) format.', 'merodiet' ), 400 );
		}

		self::save_option_no_autoload( 'merodiet_digest_enabled', (bool) $request->get_param( 'enabled' ) );
		self::save_option_no_autoload( 'merodiet_digest_time', $send_time );

		DigestScheduler::reschedule();

		return $this->success(
			array(
				'enabled'   => (bool) get_option( 'merodiet_digest_enabled', false ),
				'send_time' => (string) get_option( 'merodiet_digest_time', '20:00' ),
			)
		);
	}

	/**
	 * See EmailTemplateService::save()'s identical add_option()-then-
	 * update_option() idiom for why — guarantees autoload=false
	 * regardless of which WordPress version's update_option() is in play.
	 *
	 * @param string          $name  Option name.
	 * @param bool|string     $value Option value.
	 */
	private static function save_option_no_autoload( string $name, bool|string $value ): void {
		add_option( $name, $value, '', false );
		update_option( $name, $value );
	}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `vendor/bin/phpunit tests/Unit/RestApi/SettingsControllerTest.php`
Expected: PASS (6 tests total).

- [ ] **Step 8: Run the full suite**

Run: `vendor/bin/phpunit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add includes/Email/DigestScheduler.php includes/RestApi/SettingsController.php tests/Unit/Email/DigestSchedulerTest.php tests/Unit/RestApi/SettingsControllerTest.php
git commit -m "feat: add DigestScheduler and GET/PUT /settings/email-digest routes"
```

---

### Task 7: ClientInviteService — the invite-vs-reset flag

**Files:**
- Modify: `includes/Clients/ClientInviteService.php`
- Modify: `tests/Unit/Clients/ClientInviteServiceTest.php`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ClientInviteService::is_sending_invite(): bool` (static) — Task 8's `PortalPage` reads this to pick `client_invite` vs `client_password_reset`.

- [ ] **Step 1: Read the existing test file to match its style**

Run: `cat tests/Unit/Clients/ClientInviteServiceTest.php` and confirm the existing mocking pattern (a real `ClientInviteService` with a mocked `ClientRepository`, `Functions\when()` for WordPress functions) before adding to it — this task's new test must fit the same shape.

- [ ] **Step 2: Write the failing test** (append to the existing file)

```php
	public function test_the_sending_invite_flag_is_true_during_invite_and_resets_afterward_even_on_failure(): void {
		Functions\when( 'get_current_user_id' )->justReturn( 1 );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find' )->willReturn(
			array( 'id' => 1, 'user_id' => null, 'email' => 'client@example.test' )
		);
		// A WP user already exists with this email — invite() returns a
		// WP_Error without ever reaching retrieve_password().
		Functions\when( 'get_user_by' )->justReturn( (object) array( 'ID' => 55 ) );

		self::assertFalse( ClientInviteService::is_sending_invite() );

		$service = new ClientInviteService( $clients );
		$result  = $service->invite( 1 );

		self::assertTrue( is_wp_error( $result ) );
		self::assertFalse( ClientInviteService::is_sending_invite() );
	}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `vendor/bin/phpunit tests/Unit/Clients/ClientInviteServiceTest.php`
Expected: FAIL — `Call to undefined method ...ClientInviteService::is_sending_invite()`.

- [ ] **Step 4: Modify `ClientInviteService`**

Add a private static property and public static getter, and wrap `invite()`'s existing body in `try`/`finally`:

```php
	/**
	 * True only while invite() is on the stack — lets PortalPage's
	 * retrieve_password_message/retrieve_password_title filters tell
	 * "this retrieve_password() call is an invite" apart from "this is
	 * a genuine forgot-password request", since both currently funnel
	 * through the same WP core function. Reset in a finally block so a
	 * WP_Error partway through invite() (e.g. the email is already in
	 * use) never leaves this stuck true for the next, unrelated
	 * request in the same PHP process (relevant for a long-running
	 * wp-cli/cron context more than a normal request, but cheap to get
	 * right).
	 */
	private static bool $sending_invite = false;

	/**
	 * Whether an invite() call is currently in progress.
	 */
	public static function is_sending_invite(): bool {
		return self::$sending_invite;
	}
```

Then change the method signature area so the whole existing body is wrapped:

```php
	public function invite( int $client_id ): bool|WP_Error {
		self::$sending_invite = true;

		try {
			$client = $this->clients->find( $client_id );

			if ( null === $client ) {
				return new WP_Error( 'merodiet_not_found', __( 'Client not found.', 'merodiet' ), array( 'status' => 404 ) );
			}

			if ( null !== $client['user_id'] ) {
				$user = get_user_by( 'id', $client['user_id'] );

				if ( false !== $user ) {
					$result = retrieve_password( $user->user_login );

					if ( $result instanceof WP_Error ) {
						return $result;
					}

					return true;
				}
				// The linked user was deleted out-of-band — fall through and
				// re-provision a fresh one below, same as a first invite.
			}

			$existing = get_user_by( 'email', $client['email'] );

			if ( false !== $existing ) {
				return new WP_Error(
					'merodiet_email_in_use',
					__( 'A WordPress account with this email already exists. Link or resolve it manually before inviting this client.', 'merodiet' ),
					array( 'status' => 409 )
				);
			}

			$login   = sanitize_user( current( explode( '@', $client['email'] ) ) . '-' . $client_id, true );
			$user_id = wp_insert_user(
				array(
					'user_login' => $login,
					'user_email' => $client['email'],
					'user_pass'  => wp_generate_password( 32 ),
					'role'       => 'nutrition_client',
				)
			);

			if ( is_wp_error( $user_id ) ) {
				return $user_id;
			}

			$this->clients->set_user_id( $client_id, (int) $user_id );

			$user   = get_user_by( 'id', $user_id );
			$result = retrieve_password( false !== $user ? $user->user_login : $login );

			if ( $result instanceof WP_Error ) {
				return $result;
			}

			// Fires after a client is invited to the portal.
			do_action( 'merodiet_client_invited', $client_id, $user_id );

			return true;
		} finally {
			self::$sending_invite = false;
		}
	}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `vendor/bin/phpunit tests/Unit/Clients/ClientInviteServiceTest.php`
Expected: PASS (all existing tests + the new one).

- [ ] **Step 6: Commit**

```bash
git add includes/Clients/ClientInviteService.php tests/Unit/Clients/ClientInviteServiceTest.php
git commit -m "feat: flag invite() calls so retrieve_password() emails can be told apart"
```

---

### Task 8: PortalPage + PortalServiceProvider — branded invite/reset emails

**Files:**
- Modify: `includes/Clients/PortalPage.php`
- Modify: `includes/Providers/PortalServiceProvider.php`
- Modify: `tests/Unit/Clients/PortalPageTest.php`

**Interfaces:**
- Consumes: `Mailer::render_html()` (Task 3), `ClientInviteService::is_sending_invite()` (Task 7).
- Produces: `PortalPage::customize_reset_password_subject(string $title, string $user_login, WP_User $user_data): string` (new — hooked to `retrieve_password_title`). `customize_reset_password_email()`'s existing signature/return type are unchanged; only its body and the constructor change.

- [ ] **Step 1: Write the failing test** (append to `tests/Unit/Clients/PortalPageTest.php`)

```php
	public function test_customize_reset_password_email_uses_the_invite_template_while_a_client_is_being_invited(): void {
		Functions\when( 'get_option' )->justReturn( '' );
		Functions\when( 'home_url' )->alias( static fn ( string $path = '' ) => 'https://example.test' . $path );
		Functions\when( 'add_query_arg' )->alias(
			static fn ( $key, $value = '', $url = '' ) => is_array( $key ) ? ( $url ?: 'https://example.test/' ) : ( $url ?: 'https://example.test/' )
		);
		Functions\when( 'get_bloginfo' )->justReturn( 'Test Practice' );
		Functions\when( 'get_theme_mod' )->justReturn( false );
		Functions\when( 'get_userdata' )->justReturn( false );
		Functions\when( 'esc_html' )->returnArg( 1 );

		$user = $this->createMock( WP_User::class );
		$user->method( 'has_cap' )->with( 'view_own_merodiet_plan' )->willReturn( true );
		$user->ID = 42;

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_user' )->with( 42 )->willReturn(
			array( 'first_name' => 'Ana', 'last_name' => 'Lee', 'practitioner_user_id' => 7 )
		);

		$templates = new EmailTemplateService();
		$mailer    = new Mailer( $templates );
		$page      = new PortalPage( $clients, $mailer );

		ClientInviteServiceTestHelper::force_sending_invite( true );
		$result = $page->customize_reset_password_email( 'original core message', 'key123', 'ana', $user );
		ClientInviteServiceTestHelper::force_sending_invite( false );

		self::assertStringContainsString( 'invited', $result );
	}
```

This test needs a tiny reflection helper (since `ClientInviteService::$sending_invite` is private with no setter — it's only ever set from inside `invite()` itself). Create it alongside the test:

```php
<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit\Clients;

use MeroDiet\Clients\ClientInviteService;
use ReflectionProperty;

/**
 * Test-only reflection shim: ClientInviteService::$sending_invite is
 * intentionally private with no public setter (see its own docblock —
 * it's only ever toggled from inside invite() itself, via try/finally).
 * This exists so PortalPageTest can exercise the "currently sending an
 * invite" branch without going through a real invite() call, which
 * would need an unrelated pile of wp_insert_user()/retrieve_password()
 * stubs that this test doesn't otherwise care about.
 */
final class ClientInviteServiceTestHelper {

	public static function force_sending_invite( bool $value ): void {
		$property = new ReflectionProperty( ClientInviteService::class, 'sending_invite' );
		$property->setAccessible( true );
		$property->setValue( null, $value );
	}
}
```

Add `use MeroDiet\Email\EmailTemplateService;`, `use MeroDiet\Email\Mailer;`, `use MeroDiet\Clients\ClientInviteService;` to `PortalPageTest.php`'s imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit tests/Unit/Clients/PortalPageTest.php`
Expected: FAIL — `Too few arguments to function ...PortalPage::__construct()`.

- [ ] **Step 3: Modify `PortalPage`**

Add imports:

```php
use MeroDiet\Clients\ClientInviteService;
use MeroDiet\Email\Mailer;
```

Change the constructor:

```php
	public function __construct(
		private readonly ClientRepository $clients,
		private readonly Mailer $mailer
	) {}
```

Replace `customize_reset_password_email()`'s body:

```php
	public function customize_reset_password_email( string $message, string $key, string $user_login, WP_User $user_data ): string {
		if ( ! $user_data->has_cap( 'view_own_merodiet_plan' ) ) {
			return $message;
		}

		$client = $this->clients->find_for_user( $user_data->ID );

		if ( null === $client ) {
			return $message;
		}

		add_filter( 'wp_mail_content_type', array( self::class, 'force_html_content_type' ) );

		return $this->mailer->render_html(
			self::current_email_type(),
			self::email_context( $client, $key, $user_login )
		)['body'];
	}

	/**
	 * Hooked to retrieve_password_title, alongside
	 * customize_reset_password_email()'s retrieve_password_message
	 * hook — same guard, same context, just the subject half of the
	 * same email.
	 *
	 * @param string  $title      The default subject core built.
	 * @param string  $user_login The user's login.
	 * @param WP_User $user_data  The user the reset is for.
	 */
	public function customize_reset_password_subject( string $title, string $user_login, WP_User $user_data ): string {
		if ( ! $user_data->has_cap( 'view_own_merodiet_plan' ) ) {
			return $title;
		}

		$client = $this->clients->find_for_user( $user_data->ID );

		if ( null === $client ) {
			return $title;
		}

		return $this->mailer->render_html(
			self::current_email_type(),
			self::email_context( $client, '', $user_login )
		)['subject'];
	}

	/**
	 * Self-removing wp_mail_content_type filter — fires exactly once,
	 * for the single wp_mail() call retrieve_password() makes right
	 * after this filter runs, then unhooks itself so it never affects
	 * an unrelated later email in the same request.
	 */
	public static function force_html_content_type(): string {
		remove_filter( 'wp_mail_content_type', array( self::class, 'force_html_content_type' ) );
		return 'text/html';
	}

	/**
	 * Which of the two client-facing email types this retrieve_password()
	 * call is — see ClientInviteService::is_sending_invite()'s docblock.
	 */
	private static function current_email_type(): string {
		return ClientInviteService::is_sending_invite() ? 'client_invite' : 'client_password_reset';
	}

	/**
	 * The merge-tag context both the subject and body renders need.
	 * $key is '' when called from customize_reset_password_subject()
	 * (the subject template has no {{reset_url}} tag to fill, so the
	 * unused value is harmless).
	 *
	 * @param array<string, mixed> $client     The client row (from find_for_user()).
	 * @param string               $key        The reset key core generated, or '' when building subject-only context.
	 * @param string               $user_login The user's login.
	 *
	 * @return array<string, string>
	 */
	private static function email_context( array $client, string $key, string $user_login ): array {
		$practitioner_id = (int) ( $client['practitioner_user_id'] ?? 0 );
		$practitioner     = 0 !== $practitioner_id ? get_userdata( $practitioner_id ) : false;

		$reset_url = '' !== $key
			? add_query_arg(
				array(
					'merodiet_action' => 'resetpass',
					'key'           => $key,
					'login'         => rawurlencode( $user_login ),
				),
				PortalRewrite::url()
			)
			: '';

		return array(
			'client_first_name' => (string) ( $client['first_name'] ?? '' ),
			'client_last_name'  => (string) ( $client['last_name'] ?? '' ),
			'practitioner_name' => false !== $practitioner ? $practitioner->display_name : '',
			'portal_url'        => PortalRewrite::url(),
			'reset_url'         => $reset_url,
			'site_name'         => get_bloginfo( 'name' ),
		);
	}
```

- [ ] **Step 4: Modify `PortalServiceProvider`**

Update the `PortalPage` binding in `register()` to add `Mailer` as a second argument:

```php
		if ( ! $container->has( ClientRepository::class ) ) {
			$container->add( ClientRepository::class )->setShared( true );
		}

		$container->add( PortalPage::class )
			->setShared( true )
			->addArgument( ClientRepository::class )
			->addArgument( \MeroDiet\Email\Mailer::class );
```

(`Mailer::class` and its own `EmailTemplateService::class` dependency are both already bound by `AppServiceProvider`, which runs before `PortalServiceProvider` in `config/app.php`'s providers list — no `if ( ! $container->has(...) )` guard needed for either.)

Add the new filter hook in `boot()`, right after the existing `retrieve_password_message` one:

```php
		add_filter(
			'retrieve_password_title',
			static function ( $title, $user_login, $user_data ) use ( $container ) {
				/**
				 * The shared PortalPage instance.
				 *
				 * @var PortalPage $page
				 */
				$page = $container->get( PortalPage::class );
				return $page->customize_reset_password_subject( $title, $user_login, $user_data );
			},
			10,
			3
		);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `vendor/bin/phpunit tests/Unit/Clients/PortalPageTest.php`
Expected: PASS (all existing tests, updated for the new constructor arg where needed, plus the new one). Every other existing test in this file that constructs `new PortalPage( $clients )` now needs a second `Mailer` argument — construct one inline the same way the new test does (`new Mailer( new EmailTemplateService() )`), since neither has side effects at construction time.

- [ ] **Step 6: Run the full suite**

Run: `vendor/bin/phpunit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add includes/Clients/PortalPage.php includes/Providers/PortalServiceProvider.php tests/Unit/Clients/PortalPageTest.php tests/Unit/Clients/ClientInviteServiceTestHelper.php
git commit -m "feat: send branded client_invite/client_password_reset emails"
```

---

### Task 9: ClientsController — practitioner_client_added trigger

**Files:**
- Modify: `includes/RestApi/ClientsController.php`
- Modify: `config/app.php` (`ClientsController::class` dependency array)
- Modify: `tests/Unit/RestApi/ClientsControllerCreateTest.php`

**Interfaces:**
- Consumes: `Mailer::send()` (Task 3).
- Produces: nothing new for later tasks — this is a leaf trigger.

- [ ] **Step 1: Write the failing test** (append to `ClientsControllerCreateTest.php`)

```php
	public function test_creating_a_client_emails_the_practitioner(): void {
		Functions\when( 'get_current_user_id' )->justReturn( 42 );

		$current_user            = $this->createMock( \WP_User::class );
		$current_user->display_name = 'Dr. Lee';
		$current_user->user_email   = 'practitioner@example.test';
		Functions\when( 'wp_get_current_user' )->justReturn( $current_user );

		$mailer = $this->createMock( \MeroDiet\Email\Mailer::class );
		$mailer->expects( self::once() )
			->method( 'send' )
			->with(
				'practitioner_client_added',
				'practitioner@example.test',
				self::callback(
					static fn ( array $context ) =>
						'E2E' === $context['client_first_name']
						&& 'Client' === $context['client_last_name']
				)
			)
			->willReturn( true );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'create' )->willReturn( 7 );
		$clients->method( 'find' )->with( 7 )->willReturn(
			array( 'id' => 7, 'first_name' => 'E2E', 'last_name' => 'Client', 'email' => 'client@example.test', 'user_id' => null )
		);

		$controller = new ClientsController(
			$clients,
			new ClientInviteService( $this->createMock( ClientRepository::class ) ),
			$this->createMock( LogEntryRepository::class ),
			$this->createMock( MeasurementRepository::class ),
			new ComplianceCalculator(
				$this->createMock( PlanRepository::class ),
				$this->createMock( LogEntryRepository::class )
			),
			$mailer
		);

		$controller->create_client( $this->make_request( send_invite: false ) );
	}
```

(`display_name`/`user_email` are set as public properties directly — `WP_User`'s mocked instance is a plain stdClass-like double here, matching how `$user->ID = 42;` is already assigned elsewhere in this codebase's tests, e.g. `PortalPageTest`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit tests/Unit/RestApi/ClientsControllerCreateTest.php`
Expected: FAIL — `Too few arguments to function ...ClientsController::__construct()`.

- [ ] **Step 3: Modify `ClientsController`**

Add `use MeroDiet\Email\Mailer;` to the imports. Add `Mailer $mailer` as a sixth constructor parameter:

```php
	public function __construct(
		private readonly ClientRepository $clients,
		private readonly ClientInviteService $invites,
		private readonly LogEntryRepository $logs,
		private readonly MeasurementRepository $measurements,
		private readonly ComplianceCalculator $compliance,
		private readonly Mailer $mailer
	) {}
```

In `create_client()`, right before `return $this->success( $client, 201 );`, add:

```php
		$this->mailer->send(
			'practitioner_client_added',
			wp_get_current_user()->user_email,
			array(
				'practitioner_name' => wp_get_current_user()->display_name,
				'client_first_name' => (string) $client['first_name'],
				'client_last_name'  => (string) $client['last_name'],
				'invite_status'     => self::invite_status_copy( (bool) $request->get_param( 'send_invite' ), $invite_error ),
			)
		);
```

Add the small helper:

```php
	/**
	 * @param bool        $send_invite_requested Whether the create request asked for an invite.
	 * @param string|null $invite_error           A failure message, if the invite attempt failed.
	 */
	private static function invite_status_copy( bool $send_invite_requested, ?string $invite_error ): string {
		if ( ! $send_invite_requested ) {
			return __( 'not invited (added without sending an invite)', 'merodiet' );
		}

		if ( null !== $invite_error ) {
			return sprintf(
				/* translators: %s: the reason the invite failed */
				__( 'invite failed: %s', 'merodiet' ),
				$invite_error
			);
		}

		return __( 'invited', 'merodiet' );
	}
```

- [ ] **Step 4: Update `config/app.php`**

Change:

```php
			\MeroDiet\RestApi\ClientsController::class     => array(
				\MeroDiet\Repositories\ClientRepository::class,
				\MeroDiet\Clients\ClientInviteService::class,
				\MeroDiet\Repositories\LogEntryRepository::class,
				\MeroDiet\Repositories\MeasurementRepository::class,
				\MeroDiet\Clients\ComplianceCalculator::class,
			),
```

to:

```php
			\MeroDiet\RestApi\ClientsController::class     => array(
				\MeroDiet\Repositories\ClientRepository::class,
				\MeroDiet\Clients\ClientInviteService::class,
				\MeroDiet\Repositories\LogEntryRepository::class,
				\MeroDiet\Repositories\MeasurementRepository::class,
				\MeroDiet\Clients\ComplianceCalculator::class,
				\MeroDiet\Email\Mailer::class,
			),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `vendor/bin/phpunit tests/Unit/RestApi/ClientsControllerCreateTest.php`
Expected: PASS (all existing tests + the new one — the three existing tests in this file each construct `new ClientsController(...)` directly and need a sixth argument added; pass `$this->createMock( \MeroDiet\Email\Mailer::class )` for each, since they don't assert on it).

- [ ] **Step 6: Run the full suite**

Run: `vendor/bin/phpunit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add includes/RestApi/ClientsController.php config/app.php tests/Unit/RestApi/ClientsControllerCreateTest.php
git commit -m "feat: email the practitioner when they add a new client"
```

---

### Task 10: PlansController — client_plan_assigned trigger

**Files:**
- Modify: `includes/RestApi/PlansController.php`
- Modify: `config/app.php` (`PlansController::class` dependency array)
- Test: `tests/Unit/RestApi/PlansControllerAssignTest.php`

**Interfaces:**
- Consumes: `Mailer::send()` (Task 3).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing test**

```php
<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit\RestApi;

use Brain\Monkey\Functions;
use MeroDiet\Clients\PortalRewrite;
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

final class PlansControllerAssignTest extends TestCase {

	public function test_assigning_a_plan_emails_the_client(): void {
		Functions\when( 'get_current_user_id' )->justReturn( 42 );
		Functions\when( 'get_option' )->justReturn( '' );
		Functions\when( 'home_url' )->alias( static fn ( string $path = '' ) => 'https://example.test' . $path );

		$plan_row = array(
			'id'         => 5,
			'status'     => 'draft',
			'title'      => 'Test Plan',
			'start_date' => '2026-10-01',
			'end_date'   => '2026-10-07',
		);

		$plans = $this->createMock( PlanRepository::class );
		$plans->method( 'find_for_practitioner' )->willReturn( $plan_row );
		$plans->method( 'find_overlapping_assigned_plan' )->willReturn( null );
		$plans->method( 'assign' )->willReturn( true );
		$plans->method( 'find' )->willReturn( array_merge( $plan_row, array( 'status' => 'assigned' ) ) );

		$client_row = array( 'id' => 9, 'email' => 'client@example.test', 'first_name' => 'Ana' );
		$clients    = $this->createMock( ClientRepository::class );
		$clients->method( 'find_for_practitioner' )->willReturn( $client_row );

		$resolver = $this->createMock( PlanNutrientResolver::class );
		$resolver->method( 'calculate_plan_totals' )->willReturn( array() );

		$mailer = $this->createMock( Mailer::class );
		$mailer->expects( self::once() )
			->method( 'send' )
			->with(
				'client_plan_assigned',
				'client@example.test',
				self::callback(
					static fn ( array $context ) => 'Test Plan' === $context['plan_title']
				)
			)
			->willReturn( true );

		$controller = new PlansController(
			$plans,
			$resolver,
			$clients,
			$this->createMock( FoodCache::class ),
			$this->createMock( RecipeRepository::class ),
			$this->createMock( RecipeNutrientResolver::class ),
			$mailer
		);

		$request = new WP_REST_Request();
		$request->set_param( 'id', 5 );
		$request->set_param( 'client_id', 9 );

		$controller->assign_plan( $request );
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit tests/Unit/RestApi/PlansControllerAssignTest.php`
Expected: FAIL — `Too few arguments to function ...PlansController::__construct()`.

- [ ] **Step 3: Modify `PlansController`**

Add `use MeroDiet\Clients\PortalRewrite;` and `use MeroDiet\Email\Mailer;` to the imports. Add `Mailer $mailer` as a seventh constructor parameter:

```php
	public function __construct(
		private readonly PlanRepository $plans,
		private readonly PlanNutrientResolver $resolver,
		private readonly ClientRepository $clients,
		private readonly FoodCache $food_cache,
		private readonly RecipeRepository $recipes,
		private readonly RecipeNutrientResolver $recipe_resolver,
		private readonly Mailer $mailer
	) {}
```

In `assign_plan()`, right after `$this->plans->assign( $id, $client_id, $snapshot );` and before the `$assigned = $this->plans->find( $id );` block, add:

```php
		$this->mailer->send(
			'client_plan_assigned',
			(string) $client['email'],
			array(
				'client_first_name' => (string) $client['first_name'],
				'practitioner_name' => wp_get_current_user()->display_name,
				'plan_title'        => (string) $plan['title'],
				'start_date'        => (string) $plan['start_date'],
				'end_date'          => (string) $plan['end_date'],
				'portal_url'        => PortalRewrite::url(),
			)
		);
```

- [ ] **Step 4: Update `config/app.php`**

Change the `PlansController::class` entry to append `\MeroDiet\Email\Mailer::class`:

```php
			\MeroDiet\RestApi\PlansController::class       => array(
				\MeroDiet\Repositories\PlanRepository::class,
				\MeroDiet\Nutrition\PlanNutrientResolver::class,
				\MeroDiet\Repositories\ClientRepository::class,
				\MeroDiet\Nutrition\FoodCache::class,
				\MeroDiet\Repositories\RecipeRepository::class,
				\MeroDiet\Nutrition\RecipeNutrientResolver::class,
				\MeroDiet\Email\Mailer::class,
			),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `vendor/bin/phpunit tests/Unit/RestApi/PlansControllerAssignTest.php`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `vendor/bin/phpunit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add includes/RestApi/PlansController.php config/app.php tests/Unit/RestApi/PlansControllerAssignTest.php
git commit -m "feat: email the client when a plan is assigned to them"
```

---

### Task 11: DigestMailer + cron wiring

**Files:**
- Create: `includes/Email/DigestMailer.php`
- Modify: `includes/Providers/AppServiceProvider.php`
- Modify: `includes/Activation.php`
- Modify: `includes/Deactivation.php`
- Test: `tests/Unit/Email/DigestMailerTest.php`

**Interfaces:**
- Consumes: `Mailer::send()` (Task 3), `RawHtml` (Task 2), `DigestScheduler::CRON_HOOK`/`::reschedule()` (Task 6).
- Produces: `DigestMailer::run(): void`, hooked to `DigestScheduler::CRON_HOOK` in `AppServiceProvider::boot()`.

- [ ] **Step 1: Write the failing test**

```php
<?php
/**
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Tests\Unit\Email;

use Brain\Monkey\Functions;
use MeroDiet\Email\DigestMailer;
use MeroDiet\Email\Mailer;
use MeroDiet\Repositories\ClientRepository;
use MeroDiet\Repositories\LogEntryRepository;
use MeroDiet\Tests\TestCase;

final class DigestMailerTest extends TestCase {

	public function test_skips_a_practitioner_with_no_clients(): void {
		Functions\when( 'current_time' )->justReturn( '2026-09-27' );

		$practitioner              = $this->createMock( \WP_User::class );
		$practitioner->ID          = 1;
		$practitioner->display_name = 'Dr. Lee';
		$practitioner->user_email   = 'lee@example.test';
		Functions\when( 'get_users' )->justReturn( array( $practitioner ) );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'all_for_practitioner' )->willReturn( array( 'items' => array(), 'total' => 0 ) );

		$mailer = $this->createMock( Mailer::class );
		$mailer->expects( self::never() )->method( 'send' );

		$digest = new DigestMailer( $mailer, $clients, $this->createMock( LogEntryRepository::class ) );
		$digest->run();
	}

	public function test_sends_a_digest_reporting_each_client_and_escapes_client_names(): void {
		Functions\when( 'current_time' )->justReturn( '2026-09-27' );
		Functions\when( 'esc_html' )->alias( static fn ( string $text ) => htmlspecialchars( $text, ENT_QUOTES ) );
		Functions\when( 'esc_html__' )->returnArg( 1 );

		$practitioner               = $this->createMock( \WP_User::class );
		$practitioner->ID           = 1;
		$practitioner->display_name = 'Dr. Lee';
		$practitioner->user_email   = 'lee@example.test';
		Functions\when( 'get_users' )->justReturn( array( $practitioner ) );

		$clients = $this->createMock( ClientRepository::class );
		$clients->method( 'all_for_practitioner' )->willReturn(
			array(
				'items' => array(
					array( 'id' => 1, 'first_name' => '<script>Al</script>', 'last_name' => 'Lee' ),
				),
				'total' => 1,
			)
		);

		$logs = $this->createMock( LogEntryRepository::class );
		$logs->method( 'all_for_client' )->willReturn( array( array( 'id' => 1 ) ) );

		$mailer = $this->createMock( Mailer::class );
		$mailer->expects( self::once() )
			->method( 'send' )
			->with(
				'practitioner_daily_digest',
				'lee@example.test',
				self::callback(
					static function ( array $context ) {
						$table = (string) $context['report_table'];
						return str_contains( $table, '&lt;script&gt;Al&lt;/script&gt;' )
							&& ! str_contains( $table, '<script>Al</script>' );
					}
				)
			)
			->willReturn( true );

		$digest = new DigestMailer( $mailer, $clients, $logs );
		$digest->run();
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit tests/Unit/Email/DigestMailerTest.php`
Expected: FAIL — `Class "MeroDiet\Email\DigestMailer" not found`.

- [ ] **Step 3: Write the implementation**

```php
<?php
/**
 * Builds and sends the daily per-practitioner client-activity digest.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Email;

use MeroDiet\Repositories\ClientRepository;
use MeroDiet\Repositories\LogEntryRepository;

/**
 * Hooked to DigestScheduler::CRON_HOOK (see AppServiceProvider::boot()).
 * Iterates every user with the practitioner role — deliberately not
 * "the current user" (there is none, in a cron context) — and skips
 * anyone with zero active clients so an empty roster never produces
 * empty-digest noise.
 */
final class DigestMailer {

	public function __construct(
		private readonly Mailer $mailer,
		private readonly ClientRepository $clients,
		private readonly LogEntryRepository $logs
	) {}

	public function run(): void {
		$today = current_time( 'Y-m-d' );

		foreach ( get_users( array( 'role' => 'practitioner' ) ) as $practitioner ) {
			$roster = $this->clients->all_for_practitioner(
				(int) $practitioner->ID,
				1,
				10000, // Same "give me effectively everyone" idiom DashboardController::get_overview() already uses.
				array( 'status' => 'active' )
			);

			if ( 0 === count( $roster['items'] ) ) {
				continue;
			}

			$this->mailer->send(
				'practitioner_daily_digest',
				$practitioner->user_email,
				array(
					'practitioner_name' => $practitioner->display_name,
					'report_date'       => $today,
					'report_table'      => new RawHtml( $this->build_report_table( $roster['items'], $today ) ),
				)
			);
		}
	}

	/**
	 * @param array<int, array<string, mixed>> $clients The practitioner's active roster.
	 * @param string                           $today   Y-m-d, today in the site's own timezone.
	 */
	private function build_report_table( array $clients, string $today ): string {
		$rows = array();

		foreach ( $clients as $client ) {
			$todays_logs = $this->logs->all_for_client(
				(int) $client['id'],
				array(
					'from' => $today,
					'to'   => $today,
				)
			);

			$rows[] = sprintf(
				'<tr><td>%1$s %2$s</td><td>%3$s</td></tr>',
				esc_html( (string) ( $client['first_name'] ?? '' ) ),
				esc_html( (string) ( $client['last_name'] ?? '' ) ),
				count( $todays_logs ) > 0
					? esc_html__( 'Logged today', 'merodiet' )
					: esc_html__( 'No activity', 'merodiet' )
			);
		}

		return '<table>' . implode( '', $rows ) . '</table>';
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit tests/Unit/Email/DigestMailerTest.php`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the cron hook — modify `AppServiceProvider`**

Add `use MeroDiet\Email\DigestMailer;`, `use MeroDiet\Email\DigestScheduler;`, `use MeroDiet\Repositories\ClientRepository;` (already imported), `use MeroDiet\Repositories\LogEntryRepository;` to the imports. In `register()`, add:

```php
		$container->add( DigestMailer::class )
			->setShared( true )
			->addArgument( Mailer::class )
			->addArgument( ClientRepository::class )
			->addArgument( LogEntryRepository::class );
```

Add a `boot()` method (this provider had none before):

```php
	/**
	 * Hook the daily digest's WP-Cron event to actually run it.
	 *
	 * @param Container $container The DI container.
	 */
	public function boot( Container $container ): void {
		add_action(
			DigestScheduler::CRON_HOOK,
			static function () use ( $container ) {
				$container->get( DigestMailer::class )->run();
			}
		);
	}
```

- [ ] **Step 6: Modify `Activation`**

Add `use MeroDiet\Email\DigestScheduler;` and, at the end of `activate()`:

```php
		DigestScheduler::reschedule();
```

- [ ] **Step 7: Modify `Deactivation`**

```php
<?php
/**
 * Plugin deactivation.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet;

use MeroDiet\Email\DigestScheduler;

/**
 * Deactivation is reversible housekeeping only (flush rewrite rules,
 * clear scheduled events). Destructive cleanup — dropping tables,
 * deleting options — belongs in uninstall.php, gated behind an explicit
 * "remove data on uninstall" setting, and only runs when the user
 * deletes the plugin, not merely deactivates it.
 */
final class Deactivation {

	/**
	 * Reversible housekeeping only. See the class docblock for why
	 * destructive cleanup does not belong here.
	 */
	public static function deactivate(): void {
		flush_rewrite_rules();
		wp_clear_scheduled_hook( DigestScheduler::CRON_HOOK );
	}
}
```

- [ ] **Step 8: Run the full suite**

Run: `vendor/bin/phpunit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add includes/Email/DigestMailer.php includes/Providers/AppServiceProvider.php includes/Activation.php includes/Deactivation.php tests/Unit/Email/DigestMailerTest.php
git commit -m "feat: send the daily practitioner client-activity digest"
```

---

### Task 12: Frontend types

**Files:**
- Modify: `src/types.ts`

**Interfaces:**
- Produces: `EmailTemplate`, `EmailDigestSettings` types — Tasks 13-14 import these.

- [ ] **Step 1: Add to `src/types.ts`**

```ts
export interface EmailTemplate {
	type: string;
	audience: 'practitioner' | 'client';
	subject: string;
	body: string;
	tags: Record< string, string >;
}

export interface EmailDigestSettings {
	enabled: boolean;
	send_time: string;
}
```

- [ ] **Step 2: Run the TypeScript compiler to confirm no errors**

Run: `npm run check-types`
Expected: PASS (no errors — this is a pure addition, nothing consumes it yet).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add EmailTemplate/EmailDigestSettings frontend types"
```

---

### Task 13: EmailTemplateEditor component

**Files:**
- Create: `src/components/settings/EmailTemplateEditor.tsx`
- Create: `src/components/settings/EmailTemplateEditor.module.css`

**Interfaces:**
- Consumes: `EmailTemplate` (Task 12).
- Produces: `<EmailTemplateEditor template={...} onSave={(type, subject, body) => Promise<void>} />` — Task 14 renders one of these per email type.

- [ ] **Step 1: Write the component**

```tsx
import { useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import Panel, { PanelBody, PanelHead } from '../ui/Panel';
import Button from '../ui/Button';
import type { EmailTemplate } from '../../types';
import styles from './EmailTemplateEditor.module.css';

interface EmailTemplateEditorProps {
	template: EmailTemplate;
	label: string;
	onSave: ( type: string, subject: string, body: string ) => Promise< void >;
}

// One email type's subject/body editor, with a row of insert-tag
// buttons below the body textarea — the "simple builder" the design
// spec calls for, not raw HTML editing.
export default function EmailTemplateEditor( {
	template,
	label,
	onSave,
}: EmailTemplateEditorProps ) {
	const [ subject, setSubject ] = useState( template.subject );
	const [ body, setBody ] = useState( template.body );
	const [ isSaving, setIsSaving ] = useState( false );
	const bodyRef = useRef< HTMLTextAreaElement >( null );

	const insertTag = ( tag: string ) => {
		const textarea = bodyRef.current;
		if ( ! textarea ) {
			return;
		}
		const insertion = `{{${ tag }}}`;
		const start = textarea.selectionStart ?? body.length;
		const end = textarea.selectionEnd ?? body.length;
		const next = body.slice( 0, start ) + insertion + body.slice( end );
		setBody( next );
		// Restore focus + caret after the inserted tag on the next tick,
		// once React has re-rendered the textarea with the new value.
		requestAnimationFrame( () => {
			textarea.focus();
			const caret = start + insertion.length;
			textarea.setSelectionRange( caret, caret );
		} );
	};

	const handleSave = async ( event: React.FormEvent ) => {
		event.preventDefault();
		setIsSaving( true );
		try {
			await onSave( template.type, subject, body );
		} finally {
			setIsSaving( false );
		}
	};

	return (
		<Panel>
			<PanelHead>
				<h3>{ label }</h3>
			</PanelHead>
			<PanelBody>
				<form onSubmit={ handleSave } className={ styles.form }>
					<div className="merodiet-field">
						<label htmlFor={ `merodiet-email-subject-${ template.type }` }>
							{ __( 'Subject', 'merodiet' ) }
						</label>
						<input
							id={ `merodiet-email-subject-${ template.type }` }
							type="text"
							value={ subject }
							onChange={ ( event ) => setSubject( event.target.value ) }
							required
						/>
					</div>
					<div className="merodiet-field">
						<label htmlFor={ `merodiet-email-body-${ template.type }` }>
							{ __( 'Body', 'merodiet' ) }
						</label>
						<textarea
							id={ `merodiet-email-body-${ template.type }` }
							ref={ bodyRef }
							rows={ 6 }
							value={ body }
							onChange={ ( event ) => setBody( event.target.value ) }
							required
						/>
					</div>
					<div className={ styles.tagRow }>
						{ Object.entries( template.tags ).map( ( [ tag, description ] ) => (
							<button
								key={ tag }
								type="button"
								className={ styles.tagButton }
								title={ description }
								onClick={ () => insertTag( tag ) }
							>
								{ `{{${ tag }}}` }
							</button>
						) ) }
					</div>
					<Button variant="primary" type="submit" disabled={ isSaving }>
						{ __( 'Save', 'merodiet' ) }
					</Button>
				</form>
			</PanelBody>
		</Panel>
	);
}
```

- [ ] **Step 2: Write the CSS**

```css
.form {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.tagRow {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.tagButton {
	font-family: var(--font-mono, monospace);
	font-size: 11px;
	padding: 4px 8px;
	border-radius: 6px;
	border: 1px solid var(--line);
	background: var(--paper-dim);
	color: var(--ink-muted);
	cursor: pointer;
}
.tagButton:hover {
	border-color: var(--line-strong);
	color: var(--ink);
}
```

- [ ] **Step 3: Manually verify in the browser**

This is a presentational component with no store wiring of its own — Task 14 mounts it for real verification. No standalone step here beyond confirming `npm run check-types` passes.

Run: `npm run check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/EmailTemplateEditor.tsx src/components/settings/EmailTemplateEditor.module.css
git commit -m "feat: add EmailTemplateEditor (subject/body + insert-tag builder)"
```

---

### Task 14: EmailSettingsTab component

**Files:**
- Create: `src/screens/settings/EmailSettingsTab.tsx`
- Create: `src/screens/settings/EmailSettingsTab.module.css`

**Interfaces:**
- Consumes: `EmailTemplateEditor` (Task 13), `EmailTemplate`/`EmailDigestSettings` (Task 12), `ProUpsellModal` (existing, `src/components/ui/ProUpsellModal.tsx`).
- Produces: `<EmailSettingsTab audience="practitioner" />` / `<EmailSettingsTab audience="client" />` — Task 15 renders these inside `Settings.tsx`'s new tabs.

- [ ] **Step 1: Write the component**

```tsx
import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import EmailTemplateEditor from '../../components/settings/EmailTemplateEditor';
import ProUpsellModal from '../../components/ui/ProUpsellModal';
import Panel, { PanelBody, PanelHead } from '../../components/ui/Panel';
import { alertDialog } from '../../utils/confirmDialog';
import type { EmailDigestSettings, EmailTemplate } from '../../types';
import styles from './EmailSettingsTab.module.css';

interface EmailSettingsTabProps {
	audience: 'practitioner' | 'client';
}

// One label per known type — kept here rather than derived, since the
// registry only sends machine keys (see EmailTemplateRegistry) and
// this is the one place that turns them into copy a practitioner reads.
const TYPE_LABELS: Record< string, string > = {
	client_invite: __( 'Client invite', 'merodiet' ),
	client_password_reset: __( 'Client password reset', 'merodiet' ),
	client_plan_assigned: __( 'Plan assigned', 'merodiet' ),
	practitioner_client_added: __( 'New client added', 'merodiet' ),
	practitioner_daily_digest: __( 'Daily client activity digest', 'merodiet' ),
};

export default function EmailSettingsTab( { audience }: EmailSettingsTabProps ) {
	const [ templates, setTemplates ] = useState< EmailTemplate[] | null >( null );
	const [ digest, setDigest ] = useState< EmailDigestSettings | null >( null );
	const [ isProModalOpen, setProModalOpen ] = useState( false );

	useEffect( () => {
		apiFetch< EmailTemplate[] >( { path: '/merodiet/v1/settings/email-templates' } ).then(
			setTemplates
		);

		if ( 'practitioner' === audience ) {
			apiFetch< EmailDigestSettings >( {
				path: '/merodiet/v1/settings/email-digest',
			} ).then( setDigest );
		}
	}, [ audience ] );

	const handleSaveTemplate = async ( type: string, subject: string, body: string ) => {
		const result = await apiFetch< { type: string; subject: string; body: string } >( {
			path: `/merodiet/v1/settings/email-templates/${ type }`,
			method: 'PUT',
			data: { subject, body },
		} );

		setTemplates( ( previous ) =>
			( previous ?? [] ).map( ( template ) =>
				template.type === type
					? { ...template, subject: result.subject, body: result.body }
					: template
			)
		);

		await alertDialog( { message: __( 'Email template saved.', 'merodiet' ) } );
	};

	const handleSaveDigest = async ( next: EmailDigestSettings ) => {
		const result = await apiFetch< EmailDigestSettings >( {
			path: '/merodiet/v1/settings/email-digest',
			method: 'PUT',
			data: next,
		} );
		setDigest( result );
	};

	if ( null === templates ) {
		return <p>{ __( 'Loading…', 'merodiet' ) }</p>;
	}

	const visibleTemplates = templates.filter( ( template ) => template.audience === audience );

	return (
		<>
			{ 'practitioner' === audience && null !== digest && (
				<Panel>
					<PanelHead>
						<h3>{ __( 'Daily client activity digest', 'merodiet' ) }</h3>
					</PanelHead>
					<PanelBody>
						<label className={ styles.digestRow }>
							<input
								type="checkbox"
								checked={ digest.enabled }
								onChange={ ( event ) =>
									handleSaveDigest( { ...digest, enabled: event.target.checked } )
								}
							/>
							{ __( 'Send me a daily summary of client activity', 'merodiet' ) }
						</label>
						<label className={ styles.digestRow }>
							{ __( 'Send at', 'merodiet' ) }
							<input
								type="time"
								value={ digest.send_time }
								onChange={ ( event ) =>
									handleSaveDigest( { ...digest, send_time: event.target.value } )
								}
							/>
						</label>
					</PanelBody>
				</Panel>
			) }

			{ visibleTemplates.map( ( template ) => (
				<EmailTemplateEditor
					key={ template.type }
					template={ template }
					label={ TYPE_LABELS[ template.type ] ?? template.type }
					onSave={ handleSaveTemplate }
				/>
			) ) }

			<button
				type="button"
				className={ styles.lockedRow }
				onClick={ () => setProModalOpen( true ) }
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
					<rect x="5" y="11" width="14" height="9" rx="2" fill="currentColor" stroke="none" />
					<path d="M8 11V8a4 4 0 0 1 8 0v3" />
				</svg>
				{ __( 'Custom email styling', 'merodiet' ) }
			</button>

			<ProUpsellModal
				isOpen={ isProModalOpen }
				featureName={ __( 'Custom email styling', 'merodiet' ) }
				onClose={ () => setProModalOpen( false ) }
			/>
		</>
	);
}
```

- [ ] **Step 2: Write the CSS**

```css
.digestRow {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 10px;
}

.lockedRow {
	display: flex;
	align-items: center;
	gap: 8px;
	font-family: inherit;
	font-size: 13px;
	font-weight: 600;
	color: var(--ink-muted);
	background: var(--paper-dim);
	border: 1px dashed var(--line-strong);
	border-radius: 8px;
	padding: 12px 16px;
	cursor: pointer;
	width: 100%;
}
.lockedRow svg {
	width: 16px;
	height: 16px;
	flex-shrink: 0;
}
```

- [ ] **Step 3: Run the TypeScript compiler**

Run: `npm run check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/screens/settings/EmailSettingsTab.tsx src/screens/settings/EmailSettingsTab.module.css
git commit -m "feat: add EmailSettingsTab (per-audience template list + digest + locked styling)"
```

---

### Task 15: Settings.tsx tab strip + manual verification

**Files:**
- Modify: `src/screens/settings/Settings.tsx`
- Create: `src/screens/settings/Settings.module.css`

**Interfaces:**
- Consumes: `EmailSettingsTab` (Task 14).
- Produces: nothing further — this is the plan's last code task.

- [ ] **Step 1: Modify `Settings.tsx`**

Wrap the existing USDA-key content in a `General` case and add the tab strip. Replace the file's return statement and add state, following `ClientDetail.tsx`'s existing tab pattern:

```tsx
import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import Panel, { PanelBody, PanelHead } from '../../components/ui/Panel';
import Button from '../../components/ui/Button';
import EmailSettingsTab from './EmailSettingsTab';
import { alertDialog } from '../../utils/confirmDialog';
import styles from './Settings.module.css';

interface UsdaKeyState {
	is_set: boolean;
	masked: string | null;
}

type SettingsTab = 'general' | 'practitioner' | 'client';

export default function Settings() {
	const [ activeTab, setActiveTab ] = useState< SettingsTab >( 'general' );
	const [ keyState, setKeyState ] = useState< UsdaKeyState | null >( null );
	const [ isReplacing, setIsReplacing ] = useState( false );
	const [ apiKeyInput, setApiKeyInput ] = useState( '' );
	const [ isSaving, setIsSaving ] = useState( false );

	useEffect( () => {
		apiFetch< UsdaKeyState >( {
			path: '/merodiet/v1/settings/usda-key',
		} ).then( setKeyState );
	}, [] );

	const handleSave = async ( event: React.FormEvent ) => {
		event.preventDefault();
		setIsSaving( true );

		try {
			const result = await apiFetch< UsdaKeyState >( {
				path: '/merodiet/v1/settings/usda-key',
				method: 'PUT',
				data: { api_key: apiKeyInput },
			} );

			setKeyState( result );
			setIsReplacing( false );
			setApiKeyInput( '' );
			await alertDialog( {
				message: __( 'USDA API key saved.', 'merodiet' ),
			} );
		} finally {
			setIsSaving( false );
		}
	};

	return (
		<>
			<div className="merodiet-topbar">
				<h1>{ __( 'Settings', 'merodiet' ) }</h1>
			</div>

			<div className={ styles.tabs }>
				<button
					className={ `${ styles.tab } ${
						'general' === activeTab ? styles.isActive : ''
					}` }
					onClick={ () => setActiveTab( 'general' ) }
				>
					{ __( 'General', 'merodiet' ) }
				</button>
				<button
					className={ `${ styles.tab } ${
						'practitioner' === activeTab ? styles.isActive : ''
					}` }
					onClick={ () => setActiveTab( 'practitioner' ) }
				>
					{ __( 'Practitioner emails', 'merodiet' ) }
				</button>
				<button
					className={ `${ styles.tab } ${
						'client' === activeTab ? styles.isActive : ''
					}` }
					onClick={ () => setActiveTab( 'client' ) }
				>
					{ __( 'Client emails', 'merodiet' ) }
				</button>
			</div>

			{ 'general' === activeTab && (
				<Panel>
					<PanelHead>
						<h3>{ __( 'USDA FoodData Central', 'merodiet' ) }</h3>
					</PanelHead>
					<PanelBody>
						<p style={ { color: 'var(--ink-muted)', marginTop: 0 } }>
							{ __(
								'Required for recipe and plan building — this key lets MeroDiet search and pull nutrient data from the USDA FoodData Central database. Get a free key at api.data.gov/signup.',
								'merodiet'
							) }
						</p>

						{ null === keyState && (
							<p>{ __( 'Loading…', 'merodiet' ) }</p>
						) }

						{ null !== keyState && ! isReplacing && (
							<div
								style={ {
									display: 'flex',
									alignItems: 'center',
									gap: '12px',
								} }
							>
								{ keyState.is_set ? (
									<span className="merodiet-mono">
										{ keyState.masked }
									</span>
								) : (
									<span style={ { color: 'var(--ink-muted)' } }>
										{ __( 'No key set', 'merodiet' ) }
									</span>
								) }
								<Button
									variant="ghost"
									onClick={ () => setIsReplacing( true ) }
								>
									{ keyState.is_set
										? __( 'Replace key', 'merodiet' )
										: __( 'Add key', 'merodiet' ) }
								</Button>
							</div>
						) }

						{ null !== keyState && isReplacing && (
							<form
								onSubmit={ handleSave }
								style={ {
									display: 'flex',
									gap: '10px',
									alignItems: 'flex-end',
								} }
							>
								<div
									className="merodiet-field"
									style={ { flex: 1, marginBottom: 0 } }
								>
									<label htmlFor="merodiet-usda-key">
										{ __( 'USDA API key', 'merodiet' ) }
									</label>
									<input
										id="merodiet-usda-key"
										type="text"
										value={ apiKeyInput }
										onChange={ ( event ) =>
											setApiKeyInput( event.target.value )
										}
										required
									/>
								</div>
								<Button
									variant="primary"
									type="submit"
									disabled={ isSaving }
								>
									{ __( 'Save', 'merodiet' ) }
								</Button>
								<Button
									variant="ghost"
									type="button"
									disabled={ isSaving }
									onClick={ () => {
										setIsReplacing( false );
										setApiKeyInput( '' );
									} }
								>
									{ __( 'Cancel', 'merodiet' ) }
								</Button>
							</form>
						) }
					</PanelBody>
				</Panel>
			) }

			{ 'practitioner' === activeTab && (
				<EmailSettingsTab audience="practitioner" />
			) }
			{ 'client' === activeTab && <EmailSettingsTab audience="client" /> }
		</>
	);
}
```

- [ ] **Step 2: Write `Settings.module.css`** (copied from `ClientDetail.module.css`'s existing `.tabs`/`.tab`/`.tab.isActive`, same pill style)

```css
.tabs {
	display: flex;
	gap: 6px;
	margin: 20px 0 14px;
}
.tab {
	font-family: inherit;
	font-size: 13px;
	font-weight: 600;
	padding: 8px 16px;
	border-radius: 999px;
	border: 1px solid var(--line);
	background: var(--paper-dim);
	color: var(--ink-faint);
	cursor: pointer;
}
.tab.isActive {
	background: var(--ink);
	border-color: var(--ink);
	color: var(--surface);
}
```

- [ ] **Step 3: Run the TypeScript compiler**

Run: `npm run check-types`
Expected: PASS.

- [ ] **Step 4: Build and manually verify in the browser**

Run: `npm run build`

Then, using the Browser pane against the running `merodiet.local` (or `wp-env`) site:
1. Open the practitioner admin app, navigate to Settings.
2. Confirm three tabs render: General, Practitioner emails, Client emails.
3. General tab: confirm the USDA key section still works exactly as before (unchanged).
4. Practitioner emails tab: confirm "New client added" and "Daily client activity digest" sections render, the digest checkbox + time input save (`PUT /settings/email-digest` in the network tab), and clicking an insert-tag button inserts `{{tag}}` at the textarea's cursor.
5. Client emails tab: confirm "Client invite", "Client password reset", "Plan assigned" sections render and save.
6. Confirm "Custom email styling" appears locked (dashed border, lock icon) on both tabs and opens the same `ProUpsellModal` "Analytics" already uses, with the feature name substituted.
7. End-to-end: add a new client with "Send portal invite now" checked, confirm the received email is the branded `client_invite` copy (not WordPress core's generic reset email) and renders as HTML (not visible `<div>` tags) in an actual mail client/inbox.
8. Assign a plan to a client, confirm they receive the `client_plan_assigned` email.
9. Set the digest's send time a minute or two in the future, confirm (via `wp-cron` test trigger or waiting) the practitioner receives the digest email listing their active clients.

- [ ] **Step 5: Commit**

```bash
git add src/screens/settings/Settings.tsx src/screens/settings/Settings.module.css
git commit -m "feat: add Practitioner/Client email tabs to Settings"
```

---

## Self-Review Notes

**Spec coverage:** every section of the design spec maps to a task — storage/registry (Tasks 1-2), Mailer + HTML wrapping (Task 3), capability + DI wiring (Task 4), REST routes for templates and digest (Tasks 5-6), the invite/reset split (Tasks 7-8), the two new triggers (Tasks 9-10), the digest itself (Task 11), and the full frontend (Tasks 12-15). The one refinement beyond the spec's exact wording: `Mailer::render_html()` returns a string for PortalPage's two WP-core-triggered filter callbacks rather than calling `send()` (which would double-send, since core calls `wp_mail()` itself) — an engineering-level correction the spec's higher-level description didn't need to get right, now made explicit in Task 3/8.

**Placeholder scan:** none found — every step has real, complete code.

**Type consistency:** `EmailTemplateService::get()/save()/render()`, `Mailer::render_html()/send()`, `DigestScheduler::CRON_HOOK/reschedule()`, `ClientInviteService::is_sending_invite()`, and `DigestMailer::run()` are used with identical signatures everywhere they're referenced across tasks.

**Review Focus:** all five items each have their test named explicitly in the Review Focus section above, each pointing at the task that owns it.
