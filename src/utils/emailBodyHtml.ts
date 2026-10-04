// Converts the email editor's contentEditable DOM back into the format
// email bodies are stored in: inline HTML where plain newlines are line
// breaks (the sent email wraps the body in `white-space: pre-line`, see
// Mailer::wrap_in_skeleton()). So Enter -> "\n", never <p>/<br>/<div>.
//
// Only a small allow-list of inline tags survives; anything the browser
// or a paste adds (spans, fonts, inline styles) is unwrapped. The server
// still runs wp_kses_post() on save — this keeps the stored markup tidy,
// it is not the security boundary.

const INLINE_TAGS: Record< string, string > = {
	B: 'b',
	STRONG: 'b',
	I: 'i',
	EM: 'i',
	U: 'u',
};

const BLOCK_TAGS = new Set( [ 'DIV', 'P', 'LI', 'UL', 'OL' ] );

function escapeText( text: string ): string {
	return text
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' );
}

function escapeAttribute( value: string ): string {
	return escapeText( value ).replace( /"/g, '&quot;' );
}

function serializeChildren( parent: Node ): string {
	let out = '';

	parent.childNodes.forEach( ( node ) => {
		if ( node.nodeType === Node.TEXT_NODE ) {
			// contentEditable swaps repeated spaces for non-breaking ones.
			out += escapeText(
				( node.nodeValue ?? '' ).replace( /\u00a0/g, ' ' )
			);
			return;
		}

		if ( node.nodeType !== Node.ELEMENT_NODE ) {
			return;
		}

		const element = node as Element;
		const tag = element.tagName;

		if ( 'BR' === tag ) {
			out += '\n';
			return;
		}

		if ( BLOCK_TAGS.has( tag ) ) {
			// A block starts on its own line and ends its line.
			if ( out && ! out.endsWith( '\n' ) ) {
				out += '\n';
			}
			out += serializeChildren( element );
			if ( out && ! out.endsWith( '\n' ) ) {
				out += '\n';
			}
			return;
		}

		if ( 'A' === tag ) {
			const href = element.getAttribute( 'href' );
			const style = element.getAttribute( 'style' );
			const attributes =
				( href !== null
					? ` href="${ escapeAttribute( href ) }"`
					: '' ) +
				( style ? ` style="${ escapeAttribute( style ) }"` : '' );
			out += `<a${ attributes }>${ serializeChildren( element ) }</a>`;
			return;
		}

		const mapped = INLINE_TAGS[ tag ];
		const inner = serializeChildren( element );

		// Drop empty formatting wrappers the browser leaves behind.
		out +=
			mapped && inner ? `<${ mapped }>${ inner }</${ mapped }>` : inner;
	} );

	return out;
}

export function serializeEmailBody( root: HTMLElement ): string {
	// The block handling above terminates every block with a newline,
	// so the last one leaves a trailing break the author never typed.
	return serializeChildren( root ).replace( /\n$/, '' );
}
