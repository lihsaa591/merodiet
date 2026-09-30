<?php
/**
 * A merge-tag value that must render as raw HTML, never escaped.
 *
 * @package Nutrio
 */

declare( strict_types=1 );

namespace Nutrio\Email;

/**
 * Wraps a pre-built, trusted HTML fragment (currently only
 * DigestMailer's per-client report table) so EmailTemplateService::render()
 * can tell it apart from an ordinary string context value, which is
 * always HTML-escaped. Passing a plain string is the safe default;
 * this class exists so the one deliberate exception is explicit at its
 * call site rather than a silent special case inside the renderer.
 */
final class RawHtml {

	/**
	 * Constructor.
	 *
	 * @param string $html Pre-built, trusted HTML — never end-user input.
	 */
	public function __construct( private readonly string $html ) {}

	/**
	 * The wrapped HTML, unescaped.
	 */
	public function __toString(): string {
		return $this->html;
	}
}
