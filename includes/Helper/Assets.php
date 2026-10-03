<?php
/**
 * Asset enqueue helpers.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Helper;

/**
 * Thin wrapper around the dependency/version manifest that
 * `wp-scripts` generates alongside every build output
 * (`build/foo.js` + `build/foo.asset.php`), so enqueues never hardcode
 * a stale dependency list or a cache-busting version number by hand.
 */
final class Assets {

	/**
	 * Enqueue a script built by wp-scripts, reading its
	 * dependencies and version from the generated .asset.php file.
	 *
	 * @param string $handle    Script handle.
	 * @param string $build_dir Absolute path to the plugin's build directory (e.g. NUTRIO_PATH . 'build').
	 * @param string $build_url Public URL to the same directory (e.g. NUTRIO_URL . 'build').
	 * @param string $entry     Entry name without extension, e.g. "admin" for admin.js / admin.asset.php.
	 * @param array  $extra_deps Additional script handles to depend on, beyond what the asset file declares.
	 */
	public static function enqueue_script( string $handle, string $build_dir, string $build_url, string $entry, array $extra_deps = array() ): void {
		$asset_file = rtrim( $build_dir, '/' ) . "/{$entry}.asset.php";

		if ( ! file_exists( $asset_file ) ) {
			// Fail loudly in the console instead of a mysterious blank admin page.
			wp_die(
				esc_html(
					sprintf(
						'Nutrio: missing build asset "%s.asset.php" — run the JS build before activating this plugin.',
						$entry
					)
				)
			);
		}

		/**
		 * The generated dependency/version manifest.
		 *
		 * @var array{dependencies: string[], version: string} $asset
		 */
		$asset = require $asset_file;

		// In development, load from the running dev server for hot updates
		// instead of the last-built file.
		$src  = NUTRIO_DEVELOPMENT
			? NUTRIO_DEV_SERVER_URL . "/{$entry}.js"
			: rtrim( $build_url, '/' ) . "/{$entry}.js";
		$deps = array_merge( $asset['dependencies'], $extra_deps );

		// `wp-scripts start --hot` splits webpack's runtime into runtime.js.
		// Entry chunks only register themselves and never boot without it, so
		// it must load first or the page stays blank.
		if ( NUTRIO_DEVELOPMENT ) { // @phpstan-ignore if.alwaysFalse (constant is set per-site in wp-config.php)
			wp_register_script( 'nutrio-runtime', NUTRIO_DEV_SERVER_URL . '/runtime.js', array(), NUTRIO_VERSION, true );
			$deps[] = 'nutrio-runtime';
		}

		wp_enqueue_script(
			$handle,
			$src,
			$deps,
			$asset['version'],
			true
		);
	}

	/**
	 * Enqueue the stylesheet alongside a wp-scripts build, if one
	 * was emitted for this entry (not every entry has CSS).
	 *
	 * @param string $handle    Style handle.
	 * @param string $build_dir Absolute path to the plugin's build directory.
	 * @param string $build_url Public URL to the same directory.
	 * @param string $entry     Entry name without extension, e.g. "admin" for admin.css.
	 */
	public static function enqueue_style( string $handle, string $build_dir, string $build_url, string $entry ): void {
		$style_path = rtrim( $build_dir, '/' ) . "/{$entry}.css";

		if ( ! file_exists( $style_path ) ) {
			return;
		}

		// In development, `wp-scripts start` rewrites this file in place
		// without changing NUTRIO_VERSION, so the browser would otherwise
		// keep serving a stale cached copy across saves.
		$version = NUTRIO_DEVELOPMENT ? (string) filemtime( $style_path ) : NUTRIO_VERSION;

		wp_enqueue_style( $handle, rtrim( $build_url, '/' ) . "/{$entry}.css", array(), $version );

		// wp-scripts emits an {$entry}-rtl.css alongside every entry; this
		// tells core to swap it in on an RTL locale instead of leaving the
		// generated file unused.
		wp_style_add_data( $handle, 'rtl', 'replace' );
	}
}
