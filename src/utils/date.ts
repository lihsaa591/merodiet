const MONTHS_FULL = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
];
const MONTHS_SHORT = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
];
const DAYS_FULL = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
];
const DAYS_SHORT = [ 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ];

const DEFAULT_DATE_FORMAT = 'F j, Y';
const DEFAULT_TIME_FORMAT = 'g:i a';

function hours12( date: Date ): number {
	const hour = date.getUTCHours() % 12;

	return 0 === hour ? 12 : hour;
}

// Interprets the common subset of PHP's date() format characters against a
// UTC-midnight (or, for a datetime, UTC-labeled-but-actually-site-local —
// see formatDateTime()) Date — enough to cover every one of WP core's own
// date/time format presets (F j, Y / Y-m-d / m/d/Y / d/m/Y / g:i a / H:i)
// plus most realistic custom ones a site owner might set. \x escapes a
// literal character, same as PHP's date().
function formatWithPhpFormat( date: Date, format: string ): string {
	let result = '';

	for ( let i = 0; i < format.length; i++ ) {
		const char = format[ i ];

		if ( '\\' === char ) {
			result += format[ ++i ] ?? '';
			continue;
		}

		switch ( char ) {
			case 'd':
				result += String( date.getUTCDate() ).padStart( 2, '0' );
				break;
			case 'j':
				result += String( date.getUTCDate() );
				break;
			case 'D':
				result += DAYS_SHORT[ date.getUTCDay() ];
				break;
			case 'l':
				result += DAYS_FULL[ date.getUTCDay() ];
				break;
			case 'N':
				result += String(
					date.getUTCDay() === 0 ? 7 : date.getUTCDay()
				);
				break;
			case 'w':
				result += String( date.getUTCDay() );
				break;
			case 'F':
				result += MONTHS_FULL[ date.getUTCMonth() ];
				break;
			case 'M':
				result += MONTHS_SHORT[ date.getUTCMonth() ];
				break;
			case 'm':
				result += String( date.getUTCMonth() + 1 ).padStart( 2, '0' );
				break;
			case 'n':
				result += String( date.getUTCMonth() + 1 );
				break;
			case 'Y':
				result += String( date.getUTCFullYear() );
				break;
			case 'y':
				result += String( date.getUTCFullYear() ).slice( -2 );
				break;
			case 'H':
				result += String( date.getUTCHours() ).padStart( 2, '0' );
				break;
			case 'G':
				result += String( date.getUTCHours() );
				break;
			case 'h':
				result += String( hours12( date ) ).padStart( 2, '0' );
				break;
			case 'g':
				result += String( hours12( date ) );
				break;
			case 'i':
				result += String( date.getUTCMinutes() ).padStart( 2, '0' );
				break;
			case 's':
				result += String( date.getUTCSeconds() ).padStart( 2, '0' );
				break;
			case 'A':
				result += date.getUTCHours() < 12 ? 'AM' : 'PM';
				break;
			case 'a':
				result += date.getUTCHours() < 12 ? 'am' : 'pm';
				break;
			default:
				result += char;
		}
	}

	return result;
}

// Formats a `YYYY-MM-DD` date string per this site's own Settings → General
// → Date Format (window.nutrioAdmin.dateFormat) — falling back to WP core's
// own default preset if that isn't available (e.g. in a test environment).
export function formatDate( dateStr: string ): string {
	// Parsed as UTC midnight so the displayed date never shifts a day
	// depending on the viewer's own timezone offset.
	const date = new Date( `${ dateStr }T00:00:00Z` );
	const format = window.nutrioAdmin?.dateFormat ?? DEFAULT_DATE_FORMAT;

	return formatWithPhpFormat( date, format );
}

// Same as formatDate(), but for a MySQL DATETIME string ("2026-09-18 14:23:01",
// e.g. a row's created_at/updated_at) — formats both the date (per
// dateFormat) and the time (per timeFormat).
//
// current_time( 'mysql' ) on the backend already returns this site's own
// local wall-clock time as a plain string — not UTC. Parsing it with a "Z"
// suffix is a deliberate trick, not a timezone claim: it stops the browser
// from applying *its own* offset on top of a value that's already been
// through the site's offset once, so getUTCHours()/getUTCMinutes()/etc.
// below read back exactly the numbers that were in the string.
export function formatDateTime( dateTimeStr: string ): string {
	const date = new Date( `${ dateTimeStr.replace( ' ', 'T' ) }Z` );
	const dateFormat = window.nutrioAdmin?.dateFormat ?? DEFAULT_DATE_FORMAT;
	const timeFormat = window.nutrioAdmin?.timeFormat ?? DEFAULT_TIME_FORMAT;

	return `${ formatWithPhpFormat( date, dateFormat ) } ${ formatWithPhpFormat(
		date,
		timeFormat
	) }`;
}

// Same as formatDate(), but compact ("Sep 14") for tight spaces like day/week
// tab chips — deliberately not tied to the site's date_format setting, since
// that format can be far too long (e.g. "l, F j, Y") for a small tab label.
export function formatShortDate( dateStr: string ): string {
	const date = new Date( `${ dateStr }T00:00:00Z` );

	return date.toLocaleDateString( undefined, {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC',
	} );
}
