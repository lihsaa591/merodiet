import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import Button from './Button';
import styles from './ConfirmDialogHost.module.css';
import { registerDialogHost } from '../../utils/confirmDialog';
import type { DialogState } from '../../utils/confirmDialog';

// Mounted once at the app root — the single surface every confirm()/alert()
// call opens, replacing the browser's own unstyled window.confirm/alert.
export default function ConfirmDialogHost() {
	const [ dialog, setDialog ] = useState< DialogState | null >( null );

	useEffect( () => {
		registerDialogHost( setDialog );
		return () => registerDialogHost( null );
	}, [] );

	if ( ! dialog ) {
		return null;
	}

	const close = ( result: boolean ) => {
		dialog.resolve( result );
		setDialog( null );
	};

	return (
		// eslint-disable-next-line jsx-a11y/click-events-have-key-events,jsx-a11y/no-static-element-interactions
		<div
			className={ styles.scrim }
			onClick={ ( e ) => e.target === e.currentTarget && close( false ) }
		>
			<div className={ styles.modal }>
				{ dialog.title && <h3>{ dialog.title }</h3> }
				<p>{ dialog.message }</p>
				<div className={ styles.actions }>
					{ dialog.kind === 'confirm' ? (
						<>
							<Button
								variant="primary"
								destructive={ dialog.destructive }
								onClick={ () => close( true ) }
								style={ { justifyContent: 'center' } }
							>
								{ dialog.confirmLabel ??
									__( 'Confirm', 'nutrio' ) }
							</Button>
							<Button
								variant="ghost"
								onClick={ () => close( false ) }
								style={ { justifyContent: 'center' } }
							>
								{ dialog.cancelLabel ??
									__( 'Cancel', 'nutrio' ) }
							</Button>
						</>
					) : (
						<Button
							variant="primary"
							onClick={ () => close( true ) }
							style={ { justifyContent: 'center' } }
						>
							{ dialog.okLabel ?? __( 'OK', 'nutrio' ) }
						</Button>
					) }
				</div>
			</div>
		</div>
	);
}
