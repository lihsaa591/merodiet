/**
 * Extends the @wordpress/scripts default webpack config to build multiple
 * named entries into build/<entry>.js (+ matching .asset.php), instead of
 * the single src/index.js the default config assumes.
 *
 * Add a new admin/frontend script by adding an entry here and creating
 * the matching src/<name>/index.js file.
 */
const defaultConfig = require( '@wordpress/scripts/config/webpack.config' );
const path = require( 'path' );

/**
 * wp-scripts' css-loader already has `modules: { auto: true }` set, so any
 * *.module.css file gets CSS Modules scoping for free -- no new dependency.
 * The only thing worth customizing is the generated class name pattern, so
 * scoped names still read as ours in devtools instead of an opaque hash.
 * @param {import('webpack').Configuration} config
 */
function withNutrioModuleNames( config ) {
	for ( const rule of config.module.rules ) {
		if ( ! Array.isArray( rule.use ) ) {
			continue;
		}

		for ( const use of rule.use ) {
			if (
				use.loader &&
				use.loader.includes( 'css-loader' ) &&
				use.options?.modules
			) {
				use.options.modules = {
					...use.options.modules,
					localIdentName: 'nutrio-[name]__[local]',
				};
			}
		}
	}

	return config;
}

module.exports = {
	...withNutrioModuleNames( defaultConfig ),
	entry: {
		admin: path.resolve( __dirname, 'src/admin/index.tsx' ),
		'client-portal': path.resolve(
			__dirname,
			'src/client-portal/index.tsx'
		),
	},
	// wp-admin runs on a different origin than the dev server, so both
	// cross-origin requests and the HMR client's fetch polling need to be allowed.
	devServer: {
		...defaultConfig.devServer,
		allowedHosts: 'all',
		headers: { 'Access-Control-Allow-Origin': '*' },
	},
};
