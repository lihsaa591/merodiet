import apiFetch from '@wordpress/api-fetch';
import type { CustomFood, CustomFoodInput } from '../../types';

export function receiveCustomFoods(
	foods: CustomFood[],
	total: number,
	totalPages: number
) {
	return {
		type: 'RECEIVE_CUSTOM_FOODS' as const,
		foods,
		total,
		totalPages,
	};
}

export function receiveCustomFoodsPage(
	page: number,
	perPage: number,
	filters: Record< string, string >,
	foods: CustomFood[],
	total: number,
	totalPages: number
) {
	return {
		type: 'RECEIVE_CUSTOM_FOODS_PAGE' as const,
		page,
		perPage,
		filters,
		foods,
		total,
		totalPages,
	};
}

export function receiveCustomFood( food: CustomFood ) {
	return { type: 'RECEIVE_CUSTOM_FOOD' as const, food };
}

export function removeCustomFood( id: number ) {
	return { type: 'REMOVE_CUSTOM_FOOD' as const, id };
}

interface ThunkArgs {
	dispatch: {
		receiveCustomFood: ( food: CustomFood ) => void;
		removeCustomFood: ( id: number ) => void;
		// Invalidates every cached resolution of a selector, regardless of
		// the args each was resolved with — the right tool here since
		// getCustomFoodsPage() is called with a (page, perPage) pair, and
		// we don't know which perPage the practitioner currently has
		// active. invalidateResolution(name, [exactArgs]) would only
		// invalidate one specific args tuple and silently miss the rest.
		invalidateResolutionForStoreSelector: ( selectorName: string ) => void;
	};
}

// Thunks (not generators) — see src/store/clients/actions.ts for why.
export function createCustomFood( data: CustomFoodInput ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const food: CustomFood = await apiFetch( {
			path: '/merodiet/v1/custom-foods',
			method: 'POST',
			data,
		} );

		dispatch.receiveCustomFood( food );
		dispatch.invalidateResolutionForStoreSelector( 'getCustomFoodsPage' );
		dispatch.invalidateResolutionForStoreSelector( 'getCustomFoods' );

		return food;
	};
}

export function updateCustomFood(
	id: number,
	data: Partial< CustomFoodInput >
) {
	return async ( { dispatch }: ThunkArgs ) => {
		const food: CustomFood = await apiFetch( {
			path: `/merodiet/v1/custom-foods/${ id }`,
			method: 'PATCH',
			data,
		} );

		dispatch.receiveCustomFood( food );

		return food;
	};
}

export function deleteCustomFood( id: number ) {
	return async ( { dispatch }: ThunkArgs ) => {
		await apiFetch( {
			path: `/merodiet/v1/custom-foods/${ id }`,
			method: 'DELETE',
		} );

		dispatch.removeCustomFood( id );
	};
}
