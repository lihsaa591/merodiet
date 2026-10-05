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
	 * The effective (saved-override-or-default) subject/body for a type,
	 * plus whether it's currently enabled. `enabled` defaults to true —
	 * only client_plan_assigned and practitioner_client_added actually
	 * check it before sending (client_invite/client_password_reset are
	 * triggered by WordPress core itself and always send; the daily
	 * digest's on/off state lives in its own merodiet_digest_enabled
	 * option instead, since it gates whether the cron event is even
	 * scheduled, not just whether an email goes out when it fires).
	 *
	 * @param string $type A known type (see EmailTemplateRegistry::is_known_type()).
	 *
	 * @return array{subject: string, body: string, enabled: bool}
	 */
	public function get( string $type ): array {
		$default = EmailTemplateRegistry::get_default( $type );
		$saved   = get_option( self::option_name( $type ), array() );

		return array(
			'subject' => (string) ( $saved['subject'] ?? $default['subject'] ),
			'body'    => (string) ( $saved['body'] ?? $default['body'] ),
			'enabled' => (bool) ( $saved['enabled'] ?? true ),
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
		self::assert_known_type( $type );

		// Saving subject/body never touches enabled — read the current
		// value first so a template edit can't accidentally re-enable a
		// type the practitioner just turned off.
		$value = array(
			'subject' => sanitize_text_field( $subject ),
			'body'    => wp_kses_post( $body ),
			'enabled' => $this->get( $type )['enabled'],
		);

		self::write( $type, $value );
	}

	/**
	 * Enable or disable a type — a separate method from save() so the
	 * frontend's accordion-header toggle never has to resend the whole
	 * subject/body just to flip this one field.
	 *
	 * @param string $type    A known type (see EmailTemplateRegistry::is_known_type()).
	 * @param bool   $enabled The new enabled state.
	 *
	 * @throws InvalidArgumentException When $type isn't one EmailTemplateRegistry knows.
	 */
	public function set_enabled( string $type, bool $enabled ): void {
		self::assert_known_type( $type );

		$current = $this->get( $type );

		self::write(
			$type,
			array(
				'subject' => $current['subject'],
				'body'    => $current['body'],
				'enabled' => $enabled,
			)
		);
	}

	/**
	 * Shared guard for save()/set_enabled() — both write paths must
	 * reject an unregistered type before touching storage.
	 *
	 * @param string $type The type to check.
	 *
	 * @throws InvalidArgumentException When $type isn't one EmailTemplateRegistry knows.
	 */
	private static function assert_known_type( string $type ): void {
		if ( ! EmailTemplateRegistry::is_known_type( $type ) ) {
			throw new InvalidArgumentException( esc_html( "Unknown email template type: {$type}" ) );
		}
	}

	/**
	 * Writes the full stored shape for a type.
	 *
	 * @param string               $type  A known type.
	 * @param array<string, mixed> $value The full stored shape (subject/body/enabled).
	 */
	private static function write( string $type, array $value ): void {
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
	 * @param string                        $type    A known type.
	 * @param array<string, string|RawHtml> $context Tag name (without braces) => value.
	 *
	 * @return array{subject: string, body: string}
	 */
	public function render( string $type, array $context ): array {
		$template             = $this->get( $type );
		$body_replacements    = array();
		$subject_replacements = array();

		foreach ( $context as $tag => $value ) {
			$placeholder = '{{' . $tag . '}}';

			$body_replacements[ $placeholder ] = $value instanceof RawHtml
				? (string) $value
				: esc_html( (string) $value );

			// The subject is a plain-text mail header, not HTML — it must
			// not be esc_html()'d like the body. Newlines are stripped as
			// a defensive measure against header injection; sanitize_text_field()
			// already strips them where these values are first saved, so
			// this is belt-and-braces, not the primary defense.
			$subject_replacements[ $placeholder ] = $value instanceof RawHtml
				? (string) $value
				: str_replace( array( "\r", "\n" ), '', (string) $value );
		}

		return array(
			'subject' => strtr( $template['subject'], $subject_replacements ),
			'body'    => strtr( $template['body'], $body_replacements ),
		);
	}

	/**
	 * The WordPress option name for a type's stored override.
	 *
	 * @param string $type A known type.
	 */
	private static function option_name( string $type ): string {
		return "merodiet_email_{$type}";
	}
}
