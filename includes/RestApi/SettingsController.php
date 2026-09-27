<?php
/**
 * Practice-level settings REST endpoints.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\RestApi;

use Nutrio\Email\DigestScheduler;
use Nutrio\Email\EmailTemplateRegistry;
use Nutrio\Email\EmailTemplateService;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * Site-wide settings, not owned by any one practitioner — same
 * "capability-gated but not row-owned" shape as FoodsController's USDA
 * search. Currently just the USDA API key (see
 * FoodDataServiceProvider's docblock: "a future settings screen writes
 * it" — this is that screen's backend). The raw key is never returned
 * to the frontend once saved — only whether one is set and a masked
 * preview — so it can't leak back out through a browser devtools
 * inspection or a careless log of a REST response.
 */
final class SettingsController extends AbstractController {

	/**
	 * Route base — registers under nutrio/v1/settings.
	 *
	 * @var string
	 */
	protected string $rest_base = 'settings';

	/**
	 * @param EmailTemplateService $templates Per-type email template storage.
	 */
	public function __construct( private readonly EmailTemplateService $templates ) {}

	/**
	 * Register the USDA key routes.
	 */
	public function register_routes(): void {
		$this->register_route(
			'/usda-key',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'get_usda_key' ),
			),
			required_capability: 'manage_nutrio_foods'
		);

		$this->register_route(
			'/usda-key',
			array(
				'methods'  => WP_REST_Server::EDITABLE,
				'callback' => array( $this, 'update_usda_key' ),
				'args'     => array(
					'api_key' => array(
						'required'          => true,
						'type'              => 'string',
						'sanitize_callback' => 'sanitize_text_field',
					),
				),
			),
			required_capability: 'manage_nutrio_foods'
		);

		$this->register_route(
			'/email-templates',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'get_email_templates' ),
			),
			required_capability: 'manage_nutrio_settings'
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
			required_capability: 'manage_nutrio_settings'
		);

		$this->register_route(
			'/email-templates/(?P<type>[a-z_]+)/enabled',
			array(
				'methods'  => WP_REST_Server::EDITABLE,
				'callback' => array( $this, 'update_email_template_enabled' ),
				'args'     => array(
					'enabled' => array(
						'required' => true,
						'type'     => 'boolean',
					),
				),
			),
			required_capability: 'manage_nutrio_settings'
		);

		$this->register_route(
			'/email-digest',
			array(
				'methods'  => WP_REST_Server::READABLE,
				'callback' => array( $this, 'get_email_digest' ),
			),
			required_capability: 'manage_nutrio_settings'
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
			required_capability: 'manage_nutrio_settings'
		);
	}

	/**
	 * GET /settings/usda-key — whether a USDA API key is configured,
	 * and a masked preview if so.
	 */
	public function get_usda_key(): WP_REST_Response {
		return $this->success( self::describe( (string) get_option( 'nutrio_usda_api_key', '' ) ) );
	}

	/**
	 * PUT /settings/usda-key — set or replace the USDA API key.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function update_usda_key( WP_REST_Request $request ): WP_REST_Response {
		$api_key = (string) $request->get_param( 'api_key' );

		update_option( 'nutrio_usda_api_key', $api_key );

		return $this->success( self::describe( $api_key ) );
	}

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
				'enabled'  => $template['enabled'],
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
			return $this->error( 'nutrio_unknown_email_type', __( 'Unknown email template.', 'nutrio' ), 404 );
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
				'enabled' => $saved['enabled'],
			)
		);
	}

	/**
	 * PUT /settings/email-templates/{type}/enabled — toggle one type
	 * without resending its subject/body.
	 *
	 * @param WP_REST_Request $request The current request.
	 */
	public function update_email_template_enabled( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$type = (string) $request->get_param( 'type' );

		if ( ! EmailTemplateRegistry::is_known_type( $type ) ) {
			return $this->error( 'nutrio_unknown_email_type', __( 'Unknown email template.', 'nutrio' ), 404 );
		}

		$this->templates->set_enabled( $type, (bool) $request->get_param( 'enabled' ) );

		$saved = $this->templates->get( $type );

		return $this->success(
			array(
				'type'    => $type,
				'subject' => $saved['subject'],
				'body'    => $saved['body'],
				'enabled' => $saved['enabled'],
			)
		);
	}

	/**
	 * GET /settings/email-digest — whether the daily digest is enabled
	 * and what time it's sent.
	 */
	public function get_email_digest(): WP_REST_Response {
		return $this->success(
			array(
				'enabled'   => (bool) get_option( 'nutrio_digest_enabled', false ),
				'send_time' => (string) get_option( 'nutrio_digest_time', '20:00' ),
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
			return $this->error( 'nutrio_invalid_time', __( 'Send time must be in HH:MM (24-hour) format.', 'nutrio' ), 400 );
		}

		self::save_option_no_autoload( 'nutrio_digest_enabled', (bool) $request->get_param( 'enabled' ) );
		self::save_option_no_autoload( 'nutrio_digest_time', $send_time );

		DigestScheduler::reschedule();

		return $this->success(
			array(
				'enabled'   => (bool) get_option( 'nutrio_digest_enabled', false ),
				'send_time' => (string) get_option( 'nutrio_digest_time', '20:00' ),
			)
		);
	}

	/**
	 * See EmailTemplateService::save()'s identical add_option()-then-
	 * update_option() idiom for why — guarantees autoload=false
	 * regardless of which WordPress version's update_option() is in play.
	 *
	 * @param string      $name  Option name.
	 * @param bool|string $value Option value.
	 */
	private static function save_option_no_autoload( string $name, bool|string $value ): void {
		add_option( $name, $value, '', false );
		update_option( $name, $value );
	}

	/**
	 * The only shape a USDA key is ever returned in — never the raw value.
	 *
	 * @param string $api_key The stored (or just-saved) key.
	 *
	 * @return array{is_set:bool, masked:string|null}
	 */
	private static function describe( string $api_key ): array {
		if ( '' === $api_key ) {
			return array(
				'is_set' => false,
				'masked' => null,
			);
		}

		return array(
			'is_set' => true,
			'masked' => '••••' . substr( $api_key, -4 ),
		);
	}
}
