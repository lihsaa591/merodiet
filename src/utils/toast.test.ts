// @jest/globals ships with wp-scripts' jest; importing it gives the test globals their types without adding @types/jest.
// eslint-disable-next-line import/no-extraneous-dependencies
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
	errorMessage,
	registerToastHost,
	reportBulkResult,
	toast,
} from './toast';

describe( 'errorMessage', () => {
	it( "returns the REST error envelope's message", () => {
		expect(
			errorMessage( { code: 'x', message: 'Nope.' }, 'fallback' )
		).toBe( 'Nope.' );
	} );

	it( 'falls back for native errors without a usable message, and non-objects', () => {
		expect( errorMessage( { message: '' }, 'fallback' ) ).toBe(
			'fallback'
		);
		expect( errorMessage( null, 'fallback' ) ).toBe( 'fallback' );
		expect( errorMessage( 'boom', 'fallback' ) ).toBe( 'fallback' );
	} );
} );

describe( 'toast', () => {
	afterEach( () => registerToastHost( null ) );

	it( 'sends kind and message to the registered host', () => {
		const host = jest.fn();
		registerToastHost( host );

		toast.success( 'Saved.' );
		toast.error( 'Failed.' );
		toast.info( 'FYI.' );

		expect( host.mock.calls ).toEqual( [
			[ { kind: 'success', message: 'Saved.' } ],
			[ { kind: 'error', message: 'Failed.' } ],
			[ { kind: 'info', message: 'FYI.' } ],
		] );
	} );

	it( 'does nothing, without throwing, when no host is mounted', () => {
		expect( () => toast.success( 'Saved.' ) ).not.toThrow();
	} );
} );

describe( 'reportBulkResult', () => {
	const ok = { status: 'fulfilled', value: 1 } as const;
	const bad = { status: 'rejected', reason: new Error( 'x' ) } as const;

	it( 'reports successes and failures separately', () => {
		const host = jest.fn();
		registerToastHost( host );

		reportBulkResult( [ ok, ok, bad ], {
			success: ( n ) => `${ n } done`,
			failure: ( n ) => `${ n } failed`,
		} );

		expect( host.mock.calls ).toEqual( [
			[ { kind: 'success', message: '2 done' } ],
			[ { kind: 'error', message: '1 failed' } ],
		] );
		registerToastHost( null );
	} );

	it( 'only shows a success toast when nothing failed', () => {
		const host = jest.fn();
		registerToastHost( host );

		reportBulkResult( [ ok ], {
			success: () => 'done',
			failure: 'failed',
		} );

		expect( host.mock.calls ).toEqual( [
			[ { kind: 'success', message: 'done' } ],
		] );
		registerToastHost( null );
	} );
} );
