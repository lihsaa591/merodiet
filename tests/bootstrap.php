<?php
/**
 * PHPUnit bootstrap for pure unit tests (Brain Monkey mocks WordPress
 * functions — no database, no WP install required).
 *
 * Integration tests that need a real WordPress + database belong in a
 * separate suite run against `wp-env` (see .wp-env.json), not here.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

require_once dirname( __DIR__ ) . '/vendor/autoload.php';

// A handful of constants the plugin file itself defines, that some
// unit-tested classes reach for directly (e.g. Assets, migrations).
if ( ! defined( 'NUTRIO_VERSION' ) ) {
	define( 'NUTRIO_VERSION', '0.1.0-test' );
}
if ( ! defined( 'NUTRIO_PATH' ) ) {
	define( 'NUTRIO_PATH', dirname( __DIR__ ) . '/' );
}
if ( ! defined( 'NUTRIO_URL' ) ) {
	define( 'NUTRIO_URL', 'https://example.test/wp-content/plugins/nutrio/' );
}
if ( ! defined( 'NUTRIO_DEVELOPMENT' ) ) {
	define( 'NUTRIO_DEVELOPMENT', false );
}
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', sys_get_temp_dir() . '/' );
}

/*
 * Minimal stand-ins for the handful of WordPress core classes exercised
 * by pure unit tests. These are NOT full reimplementations — just enough
 * shape for tests that need to construct or type-check against them
 * without pulling in the full WordPress test suite (that belongs in a
 * separate wp-env integration suite, not here).
 */
if ( ! class_exists( 'WP_Error' ) ) {
	class WP_Error {
		private array $errors = array();
		private array $error_data = array();

		public function __construct( string $code = '', string $message = '', $data = '' ) {
			if ( '' !== $code ) {
				$this->errors[ $code ][] = $message;
				if ( '' !== $data ) {
					$this->error_data[ $code ] = $data;
				}
			}
		}

		public function get_error_code(): string {
			$codes = array_keys( $this->errors );
			return $codes[0] ?? '';
		}

		public function get_error_codes(): array {
			return array_keys( $this->errors );
		}

		public function has_errors(): bool {
			return array() !== $this->errors;
		}

		public function add( string $code, string $message = '', $data = '' ): void {
			$this->errors[ $code ][] = $message;
			if ( '' !== $data ) {
				$this->error_data[ $code ] = $data;
			}
		}

		public function get_error_message(): string {
			$code = $this->get_error_code();
			return $this->errors[ $code ][0] ?? '';
		}

		public function get_error_data( string $code = '' ) {
			$code = '' === $code ? $this->get_error_code() : $code;
			return $this->error_data[ $code ] ?? null;
		}
	}
}

if ( ! class_exists( 'WP_User' ) ) {
	class WP_User {
		public int $ID = 0;
		public string $display_name = '';
		public string $user_email = '';

		public function has_cap( string $capability ): bool {
			return false;
		}
	}
}

if ( ! class_exists( 'Nutrio_Tests_PHPMailerStub' ) ) {
	/**
	 * Minimal stand-in for WP core's bundled PHPMailer — just enough
	 * surface (isHTML()) for PortalPage::force_html_email() to be
	 * unit-tested without pulling in the real library. Aliased below to
	 * the real class's namespace, since PortalPage type-hints against
	 * that, not this stub, directly.
	 */
	class Nutrio_Tests_PHPMailerStub {
		public bool $is_html = false;
		public string $From = '';
		public string $FromName = '';

		public function isHTML( bool $is_html ): void {
			$this->is_html = $is_html;
		}

		public function setFrom( string $address, string $name = '', bool $auto = true ): bool {
			$this->From     = $address;
			$this->FromName = $name;
			return true;
		}
	}
}

if ( ! class_exists( 'PHPMailer\PHPMailer\PHPMailer' ) ) {
	class_alias( 'Nutrio_Tests_PHPMailerStub', 'PHPMailer\PHPMailer\PHPMailer' );
}

if ( ! class_exists( 'WP_REST_Request' ) ) {
	class WP_REST_Request {
		private array $params = array();

		public function get_param( string $key ) {
			return $this->params[ $key ] ?? null;
		}

		public function set_param( string $key, $value ): void {
			$this->params[ $key ] = $value;
		}
	}
}

if ( ! class_exists( 'WP_REST_Response' ) ) {
	class WP_REST_Response {
		public function __construct( public mixed $data = null, public int $status = 200 ) {}

		public function get_data(): mixed {
			return $this->data;
		}
	}
}

if ( ! class_exists( 'WP_REST_Server' ) ) {
	class WP_REST_Server {
		const READABLE   = 'GET';
		const CREATABLE  = 'POST';
		const EDITABLE   = 'POST, PUT, PATCH';
		const DELETABLE  = 'DELETE';
	}
}
