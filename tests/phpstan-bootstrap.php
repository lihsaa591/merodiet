<?php
/**
 * Constants normally defined at runtime by the main plugin file
 * (merodiet.php), declared here purely so PHPStan can resolve them
 * during static analysis — this file is never loaded by WordPress.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

define( 'MERODIET_VERSION', '0.1.0' );
define( 'MERODIET_FILE', dirname( __DIR__ ) . '/merodiet.php' );
define( 'MERODIET_PATH', dirname( __DIR__ ) . '/' );
define( 'MERODIET_URL', 'https://example.test/wp-content/plugins/merodiet/' );
define( 'MERODIET_BASENAME', 'merodiet/merodiet.php' );
