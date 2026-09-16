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
	foods: CustomFood[],
	total: number,
	totalPages: number
) {
	return {
		type: 'RECEIVE_CUSTOM_FOODS_PAGE' as const,
		page,
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
		invalidateResolution: (
			selectorName: string,
			args?: unknown[]
		) => void;
	};
}

// Thunks (not generators) — see src/store/clients/actions.ts for why.
export function createCustomFood( data: CustomFoodInput ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const food: CustomFood = await apiFetch( {
			path: '/nutrio/v1/custom-foods',
			method: 'POST',
			data,
		} );

		dispatch.receiveCustomFood( food );
		dispatch.invalidateResolution( 'getCustomFoodsPage', [ 1 ] );
		dispatch.invalidateResolution( 'getCustomFoods', [] );

		return food;
	};
}

export function updateCustomFood(
	id: number,
	data: Partial< CustomFoodInput >
) {
	return async ( { dispatch }: ThunkArgs ) => {
		const food: CustomFood = await apiFetch( {
			path: `/nutrio/v1/custom-foods/${ id }`,
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
			path: `/nutrio/v1/custom-foods/${ id }`,
			method: 'DELETE',
		} );

		dispatch.removeCustomFood( id );
	};
}
