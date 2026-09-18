<?php
/**
 * USDA FoodData Central HTTP client.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Nutrition;

use WP_Error;

/**
 * Thin wrapper around FoodData Central's two endpoints this app uses.
 * Deliberately does no normalization itself — see FoodDataNormalizer —
 * so this class stays a simple, mockable HTTP boundary and the parsing
 * logic stays independently testable with plain fixtures.
 *
 * Every method can return a WP_Error. Callers are responsible for
 * degrading gracefully (e.g. a food log write should never hard-fail
 * just because USDA is briefly unreachable) — this class's job is only
 * to report failure honestly, not to hide it.
 */
final class FoodDataClient {

	/**
	 * Construct with the credentials and endpoint this client talks to.
	 *
	 * @param string $api_key  USDA FoodData Central / data.gov API key.
	 * @param string $base_url API base URL, e.g. https://api.nal.usda.gov/fdc/v1.
	 * @param int    $timeout  Request timeout in seconds.
	 */
	public function __construct(
		private readonly string $api_key,
		private readonly string $base_url,
		private readonly int $timeout = 10
	) {}

	/**
	 * Search for foods by keyword.
	 *
	 * @param string   $query      Search keywords.
	 * @param string[] $data_types Restrict to these FoodData Central data types (e.g. "Foundation", "SR Legacy").
	 * @param int      $page_size  Max results per page, 1-200 per USDA's own limit.
	 * @param int      $page       1-indexed page number, for "load more".
	 *
	 * @return array{items: array<int, array<string, mixed>>, total_hits: int}|WP_Error `items` are raw search-result food summaries (partial nutrient data only — see FoodDataNormalizer's docblock; call get_details() before normalizing).
	 */
	public function search( string $query, array $data_types = array(), int $page_size = 10, int $page = 1 ): array|WP_Error {
		$params = array(
			'api_key'    => $this->api_key,
			'query'      => $query,
			'pageSize'   => max( 1, min( 200, $page_size ) ),
			'pageNumber' => max( 1, $page ),
		);

		if ( array() !== $data_types ) {
			$params['dataType'] = implode( ',', $data_types );
		}

		$response = $this->request( '/foods/search', $params );

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		return array(
			'items'      => (array) ( $response['foods'] ?? array() ),
			'total_hits' => (int) ( $response['totalHits'] ?? 0 ),
		);
	}

	/**
	 * Fetch full nutrient detail for one food.
	 *
	 * @param int $fdc_id USDA FoodData Central ID.
	 *
	 * @return array<string, mixed>|WP_Error Raw response body, ready for FoodDataNormalizer::normalize().
	 */
	public function get_details( int $fdc_id ): array|WP_Error {
		return $this->request( "/food/{$fdc_id}", array( 'api_key' => $this->api_key ) );
	}

	/**
	 * Perform a GET request and decode its JSON response.
	 *
	 * @param string               $path   Path relative to the API base URL.
	 * @param array<string, mixed> $params Query parameters.
	 *
	 * @return array<string, mixed>|WP_Error
	 */
	private function request( string $path, array $params ): array|WP_Error {
		$url = add_query_arg( $params, $this->base_url . $path );

		$response = wp_remote_get(
			$url,
			array( 'timeout' => $this->timeout )
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$status = wp_remote_retrieve_response_code( $response );
		$body   = wp_remote_retrieve_body( $response );

		if ( 429 === $status ) {
			return new WP_Error( 'nutrio_fooddata_rate_limited', __( 'USDA FoodData Central rate limit exceeded.', 'nutrio' ) );
		}

		if ( 404 === $status ) {
			return new WP_Error( 'nutrio_fooddata_not_found', __( 'Food not found.', 'nutrio' ) );
		}

		if ( $status < 200 || $status >= 300 ) {
			return new WP_Error(
				'nutrio_fooddata_http_error',
				sprintf(
					/* translators: %d: HTTP status code */
					__( 'USDA FoodData Central returned an unexpected status: %d', 'nutrio' ),
					$status
				)
			);
		}

		$decoded = json_decode( $body, true );

		if ( ! is_array( $decoded ) ) {
			return new WP_Error( 'nutrio_fooddata_invalid_response', __( 'USDA FoodData Central returned an unreadable response.', 'nutrio' ) );
		}

		return $decoded;
	}
}
