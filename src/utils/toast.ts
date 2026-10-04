// The one way to tell the user an action succeeded or failed. Mirrors the
// confirmDialog.ts pattern: <ToastHost /> registers itself once at the app
// root, and any screen calls toast.success()/error()/info() without
// prop-drilling or owning its own notice state/styles.

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
	id: number;
	kind: ToastKind;
	message: string;
}

type ToastListener = ( toast: Omit< ToastItem, 'id' > ) => void;

// Set by <ToastHost /> on mount.
let listener: ToastListener | null = null;

export function registerToastHost( fn: ToastListener | null ): void {
	listener = fn;
}

function show( kind: ToastKind, message: string ): void {
	// Not mounted (e.g. a unit test rendering a lone component): drop it
	// rather than throw — a missing toast must never break the action.
	listener?.( { kind, message } );
}

export const toast = {
	success: ( message: string ) => show( 'success', message ),
	error: ( message: string ) => show( 'error', message ),
	info: ( message: string ) => show( 'info', message ),
};

// apiFetch rejects with the REST API's error envelope ({code, message,
// data}), not a native Error — pull the server's message out of it, or use
// the caller's fallback. Replaces the copy of this check that used to live
// in every screen.
export function errorMessage( error: unknown, fallback: string ): string {
	if (
		error &&
		typeof error === 'object' &&
		'message' in error &&
		typeof error.message === 'string' &&
		error.message
	) {
		return error.message;
	}

	return fallback;
}

interface BulkMessages {
	success: ( succeededCount: number ) => string;
	failure: string | ( ( failedCount: number ) => string );
}

// Summarises a Promise.allSettled() over a bulk action: one success toast
// for the ones that worked and one error toast if any didn't, instead of
// silently ignoring partial failures.
export function reportBulkResult(
	results: PromiseSettledResult< unknown >[],
	messages: BulkMessages
): void {
	const succeeded = results.filter(
		( result ) => 'fulfilled' === result.status
	).length;
	const failed = results.length - succeeded;

	if ( succeeded > 0 ) {
		toast.success( messages.success( succeeded ) );
	}

	if ( failed > 0 ) {
		toast.error(
			'function' === typeof messages.failure
				? messages.failure( failed )
				: messages.failure
		);
	}
}
