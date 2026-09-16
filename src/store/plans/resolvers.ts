import apiFetch from '@wordpress/api-fetch';
import type { PaginatedResponse, Plan } from '../../types';

interface ThunkArgs {
	dispatch: {
		receivePlansPage: (
			page: number,
			plans: Plan[],
			total: number,
			totalPages: number
		) => void;
		receivePlan: ( plan: Plan ) => void;
	};
}

export function getPlansPage( page: number ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const response: PaginatedResponse< Plan > = await apiFetch( {
			path: `/nutrio/v1/plans?page=${ page }&per_page=20`,
		} );

		dispatch.receivePlansPage(
			page,
			response.items,
			response.total,
			response.total_pages
		);
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
