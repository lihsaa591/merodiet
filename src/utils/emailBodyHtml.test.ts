// @jest/globals ships with wp-scripts' jest; importing it gives the test globals their types without adding @types/jest.
// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from '@jest/globals';
import { serializeEmailBody } from './emailBodyHtml';

function serialize( html: string ): string {
	const root = document.createElement( 'div' );
	root.innerHTML = html;
	return serializeEmailBody( root );
}

describe( 'serializeEmailBody', () => {
	it( 'round-trips the stored format (inline HTML with newlines)', () => {
		const stored =
			'Hi {{client_first_name}},\n\n<a href="{{portal_url}}" style="color:#fff;">Go</a>\n{{portal_url}}';
		expect( serialize( stored ) ).toBe( stored );
	} );

	it( 'turns the divs Enter produces into newlines, keeping blank lines', () => {
		expect(
			serialize( 'one<div>two</div><div><br></div><div>three</div>' )
		).toBe( 'one\ntwo\n\nthree' );
	} );

	it( 'converts <br> to newlines', () => {
		expect( serialize( 'a<br>b' ) ).toBe( 'a\nb' );
	} );

	it( 'normalizes strong/em to b/i and keeps u', () => {
		expect( serialize( '<strong>a</strong> <em>b</em> <u>c</u>' ) ).toBe(
			'<b>a</b> <i>b</i> <u>c</u>'
		);
	} );

	it( 'unwraps unknown tags and drops their attributes', () => {
		expect(
			serialize(
				'<span style="color:red">x</span><font face="a">y</font>'
			)
		).toBe( 'xy' );
	} );

	it( 'drops empty formatting wrappers', () => {
		expect( serialize( 'a<b></b>b' ) ).toBe( 'ab' );
	} );

	it( 'escapes text so literal angle brackets stay text', () => {
		const root = document.createElement( 'div' );
		root.appendChild( document.createTextNode( '1 < 2 & 3 > 2' ) );
		expect( serializeEmailBody( root ) ).toBe( '1 &lt; 2 &amp; 3 &gt; 2' );
	} );

	it( 'keeps only href and style on links, escaping quotes', () => {
		expect(
			serialize(
				'<a href="https://x.test/?a=1&b=2" onclick="evil()" style="color:red">t</a>'
			)
		).toBe(
			'<a href="https://x.test/?a=1&amp;b=2" style="color:red">t</a>'
		);
	} );

	it( 'converts non-breaking spaces to plain spaces', () => {
		expect( serialize( 'a&nbsp;&nbsp;b' ) ).toBe( 'a  b' );
	} );
} );
