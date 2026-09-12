import apiFetch from '@wordpress/api-fetch';
import type { Plan } from '../../types';

interface ThunkArgs {
	dispatch: {
		receivePlans: ( plans: Plan[] ) => void;
		receivePlan: ( plan: Plan ) => void;
	};
}

export function getPlans() {
	return async ( { dispatch }: ThunkArgs ) => {
		const plans: Plan[] = await apiFetch( { path: '/nutrio/v1/plans' } );

		dispatch.receivePlans( plans );
	};
}

export function getPlan( id: number ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const plan: Plan = await apiFetch( {
			path: `/nutrio/v1/plans/${ id }`,
		} );

		dispatch.receivePlan( plan );
	};
}
