<?php
/**
 * Application bootstrap.
 *
 * Wires config/app.php into the Plugin singleton and runs it. This file
 * intentionally contains no logic beyond that wiring — anything more
 * belongs in a provider.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

use Nutrio\Plugin;

$nutrio_config = require NUTRIO_PATH . 'config/app.php';

$nutrio = Plugin::instance();

// Bind config before any provider registers, so register()/boot() can
// read it via $container->get( 'config' ).
$nutrio->container()->add( 'config', $nutrio_config )->setShared( true );

foreach ( $nutrio_config['providers'] as $nutrio_provider_class ) {
	$nutrio->add_provider( $nutrio_provider_class );
}

$nutrio->run();
