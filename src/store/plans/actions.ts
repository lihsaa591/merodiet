import apiFetch from '@wordpress/api-fetch';
import type { Plan, PlanInput } from '../../types';

export function receivePlans( plans: Plan[] ) {
	return { type: 'RECEIVE_PLANS' as const, plans };
}

export function receivePlan( plan: Plan ) {
	return { type: 'RECEIVE_PLAN' as const, plan };
}

export function removePlan( id: number ) {
	return { type: 'REMOVE_PLAN' as const, id };
}

interface ThunkArgs {
	dispatch: {
		receivePlan: ( plan: Plan ) => void;
		removePlan: ( id: number ) => void;
	};
}

// Thunks (not generators) — see src/store/clients/actions.ts for why.
export function createPlan( data: PlanInput ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const plan: Plan = await apiFetch( {
			path: '/nutrio/v1/plans',
			method: 'POST',
			data,
		} );

		dispatch.receivePlan( plan );

		return plan;
	};
}

export function updatePlan( id: number, data: Partial< PlanInput > ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const plan: Plan = await apiFetch( {
			path: `/nutrio/v1/plans/${ id }`,
			method: 'PATCH',
			data,
		} );

		dispatch.receivePlan( plan );

		return plan;
	};
}

export function deletePlan( id: number ) {
	return async ( { dispatch }: ThunkArgs ) => {
		await apiFetch( {
			path: `/nutrio/v1/plans/${ id }`,
			method: 'DELETE',
		} );

		dispatch.removePlan( id );
	};
}

export function assignPlan( id: number, clientId: number ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const plan: Plan = await apiFetch( {
			path: `/nutrio/v1/plans/${ id }/assign`,
			method: 'POST',
			data: { client_id: clientId },
		} );

		dispatch.receivePlan( plan );

		return plan;
	};
}
