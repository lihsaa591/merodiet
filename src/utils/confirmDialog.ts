interface ConfirmOptions {
	title?: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	destructive?: boolean;
}

interface AlertOptions {
	title?: string;
	message: string;
	okLabel?: string;
}

export interface DialogState {
	kind: 'confirm' | 'alert';
	title?: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	okLabel?: string;
	destructive?: boolean;
	resolve: ( result: boolean ) => void;
}

// Set once by <ConfirmDialogHost /> on mount — the imperative API below is
// how any screen opens it without prop-drilling a dialog state everywhere.
let openDialog: ( ( state: DialogState ) => void ) | null = null;

export function registerDialogHost(
	fn: ( ( state: DialogState ) => void ) | null
): void {
	openDialog = fn;
}

// Replaces window.confirm — resolves true/false, never blocks the thread.
export function confirmDialog( options: ConfirmOptions ): Promise< boolean > {
	return new Promise( ( resolve ) => {
		if ( ! openDialog ) {
			// Safety net — should never happen once ConfirmDialogHost is mounted.
			resolve( window.confirm( options.message ) ); // eslint-disable-line no-alert
			return;
		}
		openDialog( { kind: 'confirm', resolve, ...options } );
	} );
}

// Replaces window.alert — resolves once dismissed.
export function alertDialog( options: AlertOptions ): Promise< void > {
	return new Promise( ( resolve ) => {
		if ( ! openDialog ) {
			window.alert( options.message ); // eslint-disable-line no-alert
			resolve();
			return;
		}
		openDialog( { kind: 'alert', resolve: () => resolve(), ...options } );
	} );
}
