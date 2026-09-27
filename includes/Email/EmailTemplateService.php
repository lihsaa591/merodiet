<?php
/**
 * Per-type storage and merge-tag rendering for Nutrio's emails.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Email;

use InvalidArgumentException;

/**
 * Each type is its own WordPress option (nutrio_email_{type}), not one
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
	 * @param string                        $type    A known type.
	 * @param array<string, string|RawHtml> $context Tag name (without braces) => value.
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
		return "nutrio_email_{$type}";
	}
}
