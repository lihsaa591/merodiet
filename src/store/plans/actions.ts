import apiFetch from '@wordpress/api-fetch';
import type { Plan, PlanInput } from '../../types';

export function receivePlansPage(
	page: number,
	perPage: number,
	filters: Record< string, string >,
	plans: Plan[],
	total: number,
	totalPages: number
) {
	return {
		type: 'RECEIVE_PLANS_PAGE' as const,
		page,
		perPage,
		filters,
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
		// Invalidates every cached resolution of a selector, regardless of
		// the args each was resolved with — the right tool here since
		// getPlansPage() is called with a (page, perPage) pair, and we
		// don't know which perPage the practitioner currently has active.
		// invalidateResolution(name, [exactArgs]) would only invalidate one
		// specific args tuple and silently miss the rest.
		invalidateResolutionForStoreSelector: ( selectorName: string ) => void;
	};
}

// Thunks (not generators) — see src/store/clients/actions.ts for why.
export function createPlan( data: PlanInput ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const plan: Plan = await apiFetch( {
			path: '/merodiet/v1/plans',
			method: 'POST',
			data,
		} );

		dispatch.receivePlan( plan );
		// A newly created plan won't be in any cached page's id list yet —
		// invalidate every cached page so the list reflects it if the user
		// returns there (plans sort most-recent-first, so it'll land on
		// whichever page is currently "page 1").
		dispatch.invalidateResolutionForStoreSelector( 'getPlansPage' );

		return plan;
	};
}

export function updatePlan( id: number, data: Partial< PlanInput > ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const plan: Plan = await apiFetch( {
			path: `/merodiet/v1/plans/${ id }`,
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
			path: `/merodiet/v1/plans/${ id }`,
			method: 'DELETE',
		} );

		dispatch.removePlan( id );
	};
}

export function assignPlan( id: number, clientId: number ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const plan: Plan = await apiFetch( {
			path: `/merodiet/v1/plans/${ id }/assign`,
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
			path: `/merodiet/v1/plans/${ id }/unassign`,
			method: 'POST',
		} );

		dispatch.receivePlan( plan );

		return plan;
	};
}
