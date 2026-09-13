// Formats a `YYYY-MM-DD` date string as "Month Day, Year" (e.g. "September 14, 2026").
export function formatDate( dateStr: string ): string {
	// Parsed as UTC midnight so the displayed date never shifts a day
	// depending on the viewer's own timezone offset.
	const date = new Date( `${ dateStr }T00:00:00Z` );

	return date.toLocaleDateString( undefined, {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		timeZone: 'UTC',
	} );
}

// Same as formatDate(), but compact ("Sep 14") for tight spaces like day/week tab chips.
export function formatShortDate( dateStr: string ): string {
	const date = new Date( `${ dateStr }T00:00:00Z` );

	return date.toLocaleDateString( undefined, {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC',
	} );
}
