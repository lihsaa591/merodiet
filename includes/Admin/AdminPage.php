<?php
/**
 * Admin page + React mount helper.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Admin;

use Nutrio\Helper\Assets;

/**
 * Registers a top-level (or sub-menu) admin page whose body is a single
 * empty div for a React app to mount into, and enqueues the matching
 * wp-scripts build only on that page's screen — never sitewide.
 */
final class AdminPage {

	/**
	 * Construct the page definition; register() below actually hooks it in.
	 *
	 * @param string $page_title        Browser title / page heading.
	 * @param string $menu_title        Label shown in the admin menu.
	 * @param string $capability        Capability required to see this page.
	 * @param string $menu_slug         Unique menu slug; also used to scope the script enqueue to this screen.
	 * @param string $mount_element_id  DOM id the React app should mount into.
	 * @param string $script_entry      Build entry name (see webpack.config.js), e.g. "admin" for admin.js.
	 * @param string $parent_slug       Parent menu slug; empty string registers a top-level menu item.
	 * @param string $icon              Dashicon class or data: URI, top-level menus only.
	 * @param int    $position          Menu position, top-level menus only.
	 */
	public function __construct(
		private readonly string $page_title,
		private readonly string $menu_title,
		private readonly string $capability,
		private readonly string $menu_slug,
		private readonly string $mount_element_id,
		private readonly string $script_entry,
		private readonly string $parent_slug = '',
		private readonly string $icon = 'dashicons-chart-area',
		private readonly int $position = 30
	) {}

	/**
	 * Hook this page into admin_menu and admin_enqueue_scripts.
	 */
	public function register(): void {
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'maybe_enqueue' ) );
	}

	/**
	 * Registers the top-level or sub-menu page. Hooked to admin_menu.
	 */
	public function register_menu(): void {
		if ( '' === $this->parent_slug ) {
			add_menu_page(
				$this->page_title,
				$this->menu_title,
				$this->capability,
				$this->menu_slug,
				array( $this, 'render' ),
				$this->icon,
				$this->position
			);
			return;
		}

		add_submenu_page(
			$this->parent_slug,
			$this->page_title,
			$this->menu_title,
			$this->capability,
			$this->menu_slug,
			array( $this, 'render' )
		);
	}

	/**
	 * Page render callback: just the React mount point, nothing else.
	 */
	public function render(): void {
		printf( '<div id="%s"></div>', esc_attr( $this->mount_element_id ) );
	}

	/**
	 * Enqueues the build only on this page's own screen, identified by
	 * whether $hook_suffix contains this page's menu slug. Hooked to
	 * admin_enqueue_scripts.
	 *
	 * @param string $hook_suffix Current admin screen hook suffix, as passed by WordPress.
	 */
	public function maybe_enqueue( string $hook_suffix ): void {
		if ( ! str_contains( $hook_suffix, $this->menu_slug ) ) {
			return;
		}

		$handle = 'nutrio-' . $this->script_entry;

		// Dev builds split a shared "runtime" chunk that must load before the
		// entry itself, or the entry silently fails to register.
		$runtime_handle = $handle . '-runtime';

		if ( NUTRIO_DEVELOPMENT ) {
			Assets::enqueue_script( $runtime_handle, NUTRIO_PATH . 'build', NUTRIO_URL . 'build', 'runtime' );
		}

		Assets::enqueue_script(
			$handle,
			NUTRIO_PATH . 'build',
			NUTRIO_URL . 'build',
			$this->script_entry,
			NUTRIO_DEVELOPMENT ? array( $runtime_handle ) : array()
		);
		Assets::enqueue_style( $handle, NUTRIO_PATH . 'build', NUTRIO_URL . 'build', $this->script_entry );

		$current_user = wp_get_current_user();

		wp_localize_script(
			$handle,
			'nutrioAdmin',
			array(
				'restUrl'             => esc_url_raw( rest_url() ),
				'restNonce'           => wp_create_nonce( 'wp_rest' ),
				'mountId'             => $this->mount_element_id,
				'adminUrl'            => esc_url_raw( admin_url() ),
				'currentUserName'     => $current_user->display_name,
				'currentUserInitials' => self::initials( $current_user->display_name ),
				// This site's own Settings → General → Date/Time Format (PHP
				// date() format strings, e.g. "F j, Y" / "g:i a") — every
				// date/time shown in the admin app should follow them rather
				// than a hardcoded style.
				'dateFormat'          => get_option( 'date_format', 'F j, Y' ),
				'timeFormat'          => get_option( 'time_format', 'g:i a' ),
			)
		);
	}

	/**
	 * First letter of up to the first two words of a name, uppercased —
	 * used for the sidebar's own-user avatar when there's no photo.
	 *
	 * @param string $name Display name.
	 */
	private static function initials( string $name ): string {
		$words = array_filter( explode( ' ', trim( $name ) ) );

		return strtoupper( implode( '', array_map( static fn( string $word ) => mb_substr( $word, 0, 1 ), array_slice( $words, 0, 2 ) ) ) );
	}
}
