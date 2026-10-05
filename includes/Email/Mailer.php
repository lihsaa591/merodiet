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
 * Render_html() (rendered content only, no send) exists separately
 * from send() because two of the five email types (client_invite,
 * client_password_reset) are triggered by WordPress core itself via
 * retrieve_password() — core calls wp_mail() internally, so PortalPage's
 * filter callbacks must return a string, never call wp_mail() a second
 * time. Every other type is triggered by our own code, which calls
 * send() directly.
 */
final class Mailer {

	/**
	 * Constructor.
	 *
	 * @param EmailTemplateService $templates Per-type storage and merge-tag rendering.
	 */
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
		// Checked here, once, rather than in every self-triggered call
		// site — client_invite/client_password_reset never reach send()
		// at all (see class docblock), so this never blocks those two;
		// every type this method actually sends defaults to enabled.
		if ( ! $this->templates->get( $type )['enabled'] ) {
			return false;
		}

		$rendered = $this->render_html( $type, $context );

		$headers = array( 'Content-Type: text/html; charset=UTF-8' );
		$from    = EmailSender::header();

		if ( null !== $from ) {
			$headers[] = $from;
		}

		return wp_mail( $to, $rendered['subject'], $rendered['body'], $headers );
	}

	/**
	 * Wraps a rendered body in the shared header/footer HTML skeleton.
	 *
	 * @param string $body Already-rendered, already-escaped HTML body content.
	 */
	private static function wrap_in_skeleton( string $body ): string {
		return sprintf(
			'<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;max-width:480px;margin:0 auto;">' .
			'<div style="background:#5b5fa6;padding:28px 20px;text-align:center;border-radius:10px 10px 0 0;">%1$s</div>' .
			'<div style="background:#ffffff;padding:32px 28px;border:1px solid #e7e6ea;border-top:none;font-size:15px;line-height:1.6;color:#26262a;white-space:pre-line;word-break:break-word;overflow-wrap:break-word;">%2$s</div>' .
			'<div style="padding:16px 28px;text-align:center;font-size:12px;line-height:1.5;color:#9d9da3;">%3$s</div>' .
			'</div>',
			self::site_logo_html(),
			$body,
			self::footer_html()
		);
	}

	/**
	 * Our own leaf mark plus the site's title — deliberately not the
	 * site's own configured custom_logo (Appearance -> Customize),
	 * which could be anything a practitioner sets and isn't guaranteed
	 * to look right shrunk onto a colored header band the way our own
	 * asset is designed to. Table layout rather than flex/inline-block,
	 * since some email clients (notably Outlook desktop) still render
	 * those unreliably.
	 */
	private static function site_logo_html(): string {
		return sprintf(
			'<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">' .
			'<tr>' .
			'<td style="padding-right:10px;"><img src="%1$s" alt="" height="36" style="display:block;height:36px;width:auto;border:0;" /></td>' .
			'<td style="color:#ffffff;font-size:20px;font-weight:700;white-space:nowrap;">%2$s</td>' .
			'</tr>' .
			'</table>',
			esc_url( MERODIET_URL . 'assets/images/merodiet-leaf-email.png' ),
			esc_html( get_bloginfo( 'name' ) )
		);
	}

	/**
	 * A minimal, professional sign-off line — the site name plus a
	 * "you're receiving this because" note, the same low-key footer
	 * convention most transactional emails use.
	 */
	private static function footer_html(): string {
		return sprintf(
			/* translators: %s: the site's name */
			esc_html__( 'Sent by %s. If you weren\'t expecting this email, you can safely ignore it.', 'merodiet' ),
			esc_html( get_bloginfo( 'name' ) )
		);
	}
}
