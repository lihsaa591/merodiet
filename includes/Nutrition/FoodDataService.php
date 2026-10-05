<?php
/**
 * Food data orchestration: cache-first resolution against USDA.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Nutrition;

use WP_Error;

/**
 * The one entry point the rest of the app should use to get a food's
 * nutrient profile. Recipe/plan builders, the AI food-log parser (once
 * built), and anything else that needs "the nutrients for this food"
 * calls resolve() — none of them should talk to FoodDataClient or
 * FoodCache directly.
 */
class FoodDataService {

	/**
	 * Construct with the client and cache this service orchestrates between.
	 *
	 * @param FoodDataClient $client     The USDA HTTP client.
	 * @param FoodCache      $cache      The local food-data cache.
	 * @param string[]       $data_types Every data type search may return, most-preferred first — see config('fooddata.data_types').
	 */
	public function __construct(
		private readonly FoodDataClient $client,
		private readonly FoodCache $cache,
		private readonly array $data_types = array( 'Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded' )
	) {}

	/**
	 * Search USDA for candidate foods matching a query. Always live
	 * (search results aren't cached — only resolved/detailed foods are)
	 * since this is a "help the practitioner pick the right food" UI
	 * concern, not something plan/log math depends on.
	 *
	 * Branded results are excluded unless explicitly requested: USDA's
	 * search response doesn't include servingSize/servingSizeUnit (only
	 * the /food/{fdcId} detail endpoint does), so there's no way to know
	 * in advance whether a given Branded result will turn out to have a
	 * non-gram serving size and fail to resolve (see
	 * FoodDataNormalizer's docblock, points 2 and 5 — both are
	 * Branded-specific quirks; Foundation/SR Legacy/Survey always
	 * resolve). Rather than show results that might silently fail,
	 * Branded is opt-in via $include_branded.
	 *
	 * @param string $query           Search keywords.
	 * @param bool   $include_branded Whether to also search Branded (manufacturer-supplied) foods.
	 * @param int    $page_size       Max results per page.
	 * @param int    $page            1-indexed page number, for "load more".
	 *
	 * @return array{items: array<int, array<string, mixed>>, total_hits: int}|WP_Error
	 */
	public function search( string $query, bool $include_branded = false, int $page_size = 10, int $page = 1 ): array|WP_Error {
		$data_types = $include_branded
			? $this->data_types
			: array_values( array_diff( $this->data_types, array( 'Branded' ) ) );

		return $this->client->search( $query, $data_types, $page_size, $page );
	}

	/**
	 * Resolve a USDA food to its cached, normalized record — fetching
	 * and caching it on first use, returning the cached copy on every
	 * subsequent call without another API request.
	 *
	 * @param int $fdc_id USDA FoodData Central ID.
	 *
	 * @return array{id:int, source:string, source_id:int, description:string, data_type:string, nutrients:array<int, array{name:string, unit:string, amount_per_100g:float}>}|WP_Error
	 */
	public function resolve( int $fdc_id ): array|WP_Error {
		$cached = $this->cache->find_by_source( 'usda', $fdc_id );

		if ( null !== $cached ) {
			return $cached;
		}

		$raw = $this->client->get_details( $fdc_id );

		if ( is_wp_error( $raw ) ) {
			return $raw;
		}

		$normalized = FoodDataNormalizer::normalize( $raw );

		if ( null === $normalized ) {
			return new WP_Error(
				'merodiet_fooddata_unnormalizable',
				__( 'This food cannot be reliably converted to a per-100g nutrient profile — for example, its serving size is not gram-based, or USDA did not report identifiable nutrient values for it.', 'merodiet' )
			);
		}

		$internal_id = $this->cache->store( $normalized );

		/**
		 * The just-cached record, re-read to return a consistent shape
		 * regardless of whether this was a fresh insert or an update.
		 *
		 * @var array{id:int, source:string, source_id:int, description:string, data_type:string, nutrients:array<int, array{name:string, unit:string, amount_per_100g:float}>} $resolved
		 */
		$resolved = $this->cache->find( $internal_id );

		return $resolved;
	}
}
