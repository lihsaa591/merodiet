const fs = require( 'node:fs' );

/**
 * Reads a Playwright JSON report and returns a Markdown table: one
 * row per test (screen), with its violation count and top rule IDs
 * pulled from the axe attachment each spec writes via
 * scanForA11yViolations(). Exported (not just run as a script) so
 * this task's own verification can call it directly against a fixture
 * file, rather than only observing it end-to-end through a real
 * Playwright run.
 * @param {Object} reportJson Parsed Playwright JSON report.
 * @return {string} Markdown summary table.
 */
function summarize( reportJson ) {
	const errors = reportJson.errors ?? [];
	const rows = [];

	for ( const suite of reportJson.suites ?? [] ) {
		for ( const spec of suite.specs ?? [] ) {
			for ( const test of spec.tests ?? [] ) {
				for ( const result of test.results ?? [] ) {
					const attachment = ( result.attachments ?? [] ).find(
						( a ) => a.name?.startsWith( 'axe-' )
					);

					if ( ! attachment ) {
						continue;
					}

					// The JSON reporter inlines small attachments as
					// base64 in `body` rather than writing them to disk
					// with a `path`, so support both forms.
					const raw = attachment.path
						? fs.readFileSync( attachment.path, 'utf8' )
						: Buffer.from( attachment.body, 'base64' ).toString(
								'utf8'
						  );
					const violations = JSON.parse( raw );
					const ruleCounts = {};

					for ( const violation of violations ) {
						ruleCounts[ violation.id ] =
							( ruleCounts[ violation.id ] ?? 0 ) + 1;
					}

					const topRules = Object.entries( ruleCounts )
						.map( ( [ id, count ] ) => `${ id }: ${ count }` )
						.join( ', ' );

					rows.push( {
						screen: spec.title,
						count: violations.length,
						topRules: topRules || '—',
					} );
				}
			}
		}
	}

	let warning = '';

	// A non-empty top-level `errors` array means the run itself blew up
	// (e.g. globalSetup threw) before some or all specs ever executed —
	// distinct from a run that completed and simply found nothing to
	// report. Without this check, both cases produce the same "no rows"
	// output below, so a crashed run reads as a clean pass.
	if ( errors.length > 0 ) {
		const errorList = errors
			.map( ( e ) => `- ${ e.message ?? String( e ) }` )
			.join( '\n' );

		warning =
			`⚠️ The test run did not complete — only ${ rows.length } ` +
			`screen(s) were scanned before it stopped. See the errors ` +
			`below.\n\n${ errorList }\n\n`;
	}

	if ( 0 === rows.length ) {
		return warning
			? `## Accessibility scan\n\n${ warning }`
			: '## Accessibility scan\n\nNo scan attachments found in this report.\n';
	}

	const header =
		'## Accessibility scan\n\n| Screen | Violations | Top rules |\n| --- | --- | --- |\n';
	const body = rows
		.map( ( r ) => `| ${ r.screen } | ${ r.count } | ${ r.topRules } |` )
		.join( '\n' );

	return `${ header.replace(
		'## Accessibility scan\n\n',
		`## Accessibility scan\n\n${ warning }`
	) }${ body }\n`;
}

if ( require.main === module ) {
	const reportPath = process.argv[ 2 ] ?? 'playwright-report/results.json';
	const reportJson = JSON.parse( fs.readFileSync( reportPath, 'utf8' ) );
	process.stdout.write( summarize( reportJson ) );
}

module.exports = { summarize };
