<?php
/**
 * Practice-level settings REST endpoints.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\RestApi;

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
			)
		);
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
