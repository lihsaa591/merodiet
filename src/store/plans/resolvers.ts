import apiFetch from '@wordpress/api-fetch';
import type { PaginatedResponse, Plan } from '../../types';

interface ThunkArgs {
	dispatch: {
		receivePlansPage: (
			page: number,
			perPage: number,
			filters: Record< string, string >,
			plans: Plan[],
			total: number,
			totalPages: number
		) => void;
		receivePlan: ( plan: Plan ) => void;
	};
}

export function getPlansPage(
	page: number,
	perPage: number = 10,
	filters: Record< string, string > = {}
) {
	return async ( { dispatch }: ThunkArgs ) => {
		const params = new URLSearchParams( {
			page: String( page ),
			per_page: String( perPage ),
			...filters,
		} );
		const response: PaginatedResponse< Plan > = await apiFetch( {
			path: `/merodiet/v1/plans?${ params.toString() }`,
		} );

		dispatch.receivePlansPage(
			page,
			perPage,
			filters,
			response.items,
			response.total,
			response.total_pages
		);
	};
}

export function getPlan( id: number ) {
	return async ( { dispatch }: ThunkArgs ) => {
		const plan: Plan = await apiFetch( {
			path: `/merodiet/v1/plans/${ id }`,
		} );

		dispatch.receivePlan( plan );
	};
}
