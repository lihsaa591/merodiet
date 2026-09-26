/**
 * ESLint flat config for this project.
 *
 * Starts from @wordpress/scripts' default config and layers on a
 * project-specific override for the Playwright e2e directory.
 */
const defaultConfig = require( '@wordpress/scripts/config/eslint.config.cjs' );

module.exports = [
	...defaultConfig,

	// Playwright's fixture `use()` callback looks like a React hook call
	// to `react-hooks/rules-of-hooks` but isn't one — every fixture file
	// in this directory hits the same false positive.
	{
		files: [ 'tests/e2e/**/*.ts' ],
		rules: {
			'react-hooks/rules-of-hooks': 'off',
		},
	},
];
