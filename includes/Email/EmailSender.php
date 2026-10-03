<?php
/**
 * The "From" name/address Nutrio's emails are sent with.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Email;

use PHPMailer\PHPMailer\Exception as PHPMailerException;
use PHPMailer\PHPMailer\PHPMailer;

/**
 * One site-wide setting shared by every email type (practitioner and
 * client alike), stored as a single non-autoloaded option. Empty means
 * "leave WordPress's own default alone". It is applied only to emails
 * Nutrio sends — never through the global wp_mail_from filters, which
 * would also rewrite other plugins' mail.
 */
final class EmailSender {

	private const OPTION = 'nutrio_email_sender';

	/**
	 * The saved override. Either field may be empty.
	 *
	 * @return array{from_name: string, from_address: string}
	 */
	public static function get(): array {
		$saved = get_option( self::OPTION, array() );
		$saved = is_array( $saved ) ? $saved : array();

		return array(
			'from_name'    => (string) ( $saved['from_name'] ?? '' ),
			'from_address' => (string) ( $saved['from_address'] ?? '' ),
		);
	}

	/**
	 * Save the override. The caller validates the address first (see
	 * is_valid_address()); this still sanitizes defensively.
	 *
	 * @param string $from_name    Display name, or '' for WordPress's default.
	 * @param string $from_address Email address, or '' for WordPress's default.
	 */
	public static function save( string $from_name, string $from_address ): void {
		$value = array(
			'from_name'    => sanitize_text_field( $from_name ),
			'from_address' => sanitize_email( $from_address ),
		);

		add_option( self::OPTION, $value, '', false );
		update_option( self::OPTION, $value );
	}

	/**
	 * Whether an address is acceptable to save: empty (clears the
	 * override) or a valid email.
	 *
	 * @param string $address The submitted address.
	 */
	public static function is_valid_address( string $address ): bool {
		return '' === $address || false !== is_email( $address );
	}

	/**
	 * What WordPress itself would send from when nothing is set, so the
	 * settings form can show it as placeholder text.
	 *
	 * @return array{from_name: string, from_address: string}
	 */
	public static function defaults(): array {
		$host = (string) wp_parse_url( network_home_url(), PHP_URL_HOST );

		if ( str_starts_with( $host, 'www.' ) ) {
			$host = substr( $host, 4 );
		}

		return array(
			'from_name'    => 'WordPress',
			'from_address' => 'wordpress@' . $host,
		);
	}

	/**
	 * The effective sender to apply, or null when there's no override.
	 * A name without an address (or vice versa) borrows the other half
	 * from WordPress's defaults only where one is strictly required.
	 *
	 * @return array{name: string, address: string}|null
	 */
	public static function resolve(): ?array {
		$saved = self::get();

		if ( '' === $saved['from_name'] && '' === $saved['from_address'] ) {
			return null;
		}

		return array(
			'name'    => $saved['from_name'],
			'address' => '' !== $saved['from_address'] ? $saved['from_address'] : self::defaults()['from_address'],
		);
	}

	/**
	 * A wp_mail() "From:" header line for the override, or null.
	 */
	public static function header(): ?string {
		$sender = self::resolve();

		if ( null === $sender ) {
			return null;
		}

		if ( '' === $sender['name'] ) {
			return 'From: ' . $sender['address'];
		}

		// Quote the name so commas/specials can't break the header.
		$name = str_replace( array( '\\', '"' ), array( '\\\\', '\\"' ), $sender['name'] );

		return sprintf( 'From: "%s" <%s>', $name, $sender['address'] );
	}

	/**
	 * Apply the override to a PHPMailer instance about to send — for the
	 * emails WordPress core sends itself (invite / password reset via
	 * retrieve_password()), where we can't pass a header to wp_mail().
	 *
	 * @param PHPMailer $phpmailer The instance about to send.
	 */
	public static function apply_to( PHPMailer $phpmailer ): void {
		$sender = self::resolve();

		if ( null === $sender ) {
			return;
		}

		try {
			$phpmailer->setFrom( $sender['address'], $sender['name'], false );
		} catch ( PHPMailerException $e ) {
			// An address PHPMailer rejects: keep WordPress's default sender.
			unset( $e );
		}
	}
}
