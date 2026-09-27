<?php
/**
 * Wraps a rendered email template in one shared HTML skeleton and,
 * for Nutrio's own new triggers, sends it.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Email;

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
