<?php
/**
 * Resolves a human-readable food/recipe label for compliance log entries.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

namespace MeroDiet\Clients;

use MeroDiet\Nutrition\FoodCache;
use MeroDiet\Repositories\PlanRepository;
use MeroDiet\Repositories\RecipeRepository;

/**
 * A log entry only stores IDs — the plan item it was logged against
 * and/or its own food/recipe. This turns those into the name a
 * practitioner should see. Preference order: the plan item's food or
 * recipe, then the entry's own food or recipe; null when neither
 * resolves (e.g. the plan item was deleted by a later plan edit), in
 * which case the caller falls back to the entry's free-text notes.
 */
final class LogEntryLabelResolver {

	/**
	 * Construct with the lookups a label can come from.
	 *
	 * @param PlanRepository   $plans   Resolves a plan item's food/recipe reference.
	 * @param FoodCache        $foods   Resolves a food's description.
	 * @param RecipeRepository $recipes Resolves a recipe's name.
	 */
	public function __construct(
		private readonly PlanRepository $plans,
		private readonly FoodCache $foods,
		private readonly RecipeRepository $recipes
	) {}

	/**
	 * Add a `label` (string|null) to each log entry.
	 *
	 * @param array<int, array<string, mixed>> $entries Hydrated log entries.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public function with_labels( array $entries ): array {
		$food_labels   = array();
		$recipe_labels = array();

		foreach ( $entries as &$entry ) {
			$food_id   = $entry['food_id'] ?? null;
			$recipe_id = $entry['recipe_id'] ?? null;

			if ( null !== $entry['plan_item_id'] ) {
				$item = $this->plans->find_item( (int) $entry['plan_item_id'] );

				if ( null !== $item ) {
					$food_id   = $item['food_id'];
					$recipe_id = $item['recipe_id'];
				}
			}

			$entry['label'] = $this->label_for( $food_id, $recipe_id, $food_labels, $recipe_labels );
		}

		return $entries;
	}

	/**
	 * Resolve one food-or-recipe reference, memoising lookups so a long
	 * history doesn't query the same food repeatedly.
	 *
	 * @param int|null                $food_id       Food ID, if any.
	 * @param int|null                $recipe_id     Recipe ID, if any.
	 * @param array<int, string|null> $food_labels   Memoised food labels, by ID.
	 * @param array<int, string|null> $recipe_labels Memoised recipe labels, by ID.
	 */
	private function label_for( ?int $food_id, ?int $recipe_id, array &$food_labels, array &$recipe_labels ): ?string {
		if ( null !== $food_id ) {
			if ( ! array_key_exists( $food_id, $food_labels ) ) {
				$food                    = $this->foods->find( $food_id );
				$food_labels[ $food_id ] = isset( $food['description'] ) ? (string) $food['description'] : null;
			}

			return $food_labels[ $food_id ];
		}

		if ( null !== $recipe_id ) {
			if ( ! array_key_exists( $recipe_id, $recipe_labels ) ) {
				$recipe                      = $this->recipes->find( $recipe_id );
				$recipe_labels[ $recipe_id ] = isset( $recipe['name'] ) ? (string) $recipe['name'] : null;
			}

			return $recipe_labels[ $recipe_id ];
		}

		return null;
	}
}
