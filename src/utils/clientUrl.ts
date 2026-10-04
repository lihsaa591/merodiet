/**
 * Builds a link to a client's detail screen, preserving other URL params.
 *
 * @param clientId The client's internal ID.
 */
export function clientDetailUrl( clientId: number ): string {
	const url = new URL( window.location.href );
	url.searchParams.set( 'view', 'clients' );
	url.searchParams.set( 'id', String( clientId ) );
	return url.toString();
}
