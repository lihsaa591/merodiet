<?php
/**
 * Constants normally defined at runtime by the main plugin file
 * (nutrio.php), declared here purely so PHPStan can resolve them
 * during static analysis — this file is never loaded by WordPress.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

define( 'NUTRIO_VERSION', '0.1.0' );
define( 'NUTRIO_FILE', dirname( __DIR__ ) . '/nutrio.php' );
define( 'NUTRIO_PATH', dirname( __DIR__ ) . '/' );
define( 'NUTRIO_URL', 'https://example.test/wp-content/plugins/nutrio/' );
define( 'NUTRIO_BASENAME', 'nutrio/nutrio.php' );
