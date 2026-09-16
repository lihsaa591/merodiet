import apiFetch from '@wordpress/api-fetch';
import type { Plan, PlanInput } from '../../types';

export function receivePlansPage(
	page: number,
	plans: Plan[],
	total: number,
	totalPages: number
) {
	return {
		type: 'RECEIVE_PLANS_PAGE' as const,
		page,
		plans,
		total,
		totalPages,
	};
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
		// Auto-provided by @wordpress/data for any store with resolvers —
		// forces the next call to that selector+args to actually re-fetch.
		invalidateResolution: (
			selectorName: string,
			args?: unknown[]
		) => void;
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
		// A newly created plan won't be in any cached page's id list yet —
		// invalidate page 1 (plans sort most-recent-first, so that's where
		// it'll land) so the list reflects it if the user returns there.
		dispatch.invalidateResolution( 'getPlansPage', [ 1 ] );

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

export function unassignPlan( id: number ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const plan: Plan = await apiFetch( {
			path: `/nutrio/v1/plans/${ id }/unassign`,
			method: 'POST',
		} );

		dispatch.receivePlan( plan );

		return plan;
	};
}
