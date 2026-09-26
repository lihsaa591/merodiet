import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';

const WCAG_TAGS = [ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa' ];

/**
 * Runs an axe-core scan against the current page and attaches the
 * full JSON result to the Playwright report under a name that
 * includes the screen — never throws on a violation (the CI job is
 * intentionally non-blocking; see the design spec), so callers don't
 * need their own try/catch around this.
 *
 * @param page       The page to scan.
 * @param screenName Short label for the screen, used in the attachment name.
 * @param testInfo   The current test's TestInfo, used to attach the results.
 */
export async function scanForA11yViolations(
	page: Page,
	screenName: string,
	testInfo: TestInfo
): Promise< void > {
	const results = await new AxeBuilder( { page } )
		.withTags( WCAG_TAGS )
		.analyze();

	await testInfo.attach( `axe-${ screenName }`, {
		body: JSON.stringify( results.violations, null, 2 ),
		contentType: 'application/json',
	} );
}
