<?php
/**
 * Application bootstrap.
 *
 * Wires config/app.php into the Plugin singleton and runs it. This file
 * intentionally contains no logic beyond that wiring — anything more
 * belongs in a provider.
 *
 * @package MeroDiet
 */

declare( strict_types=1 );

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

use MeroDiet\Plugin;

$merodiet_config = require MERODIET_PATH . 'config/app.php';

$merodiet = Plugin::instance();

// Bind config before any provider registers, so register()/boot() can
// read it via $container->get( 'config' ).
$merodiet->container()->add( 'config', $merodiet_config )->setShared( true );

foreach ( $merodiet_config['providers'] as $merodiet_provider_class ) {
	$merodiet->add_provider( $merodiet_provider_class );
}

$merodiet->run();
