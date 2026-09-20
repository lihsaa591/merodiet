import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import Button from '../components/ui/Button';
import styles from './PasswordChangeModal.module.css';

interface PasswordChangeModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export default function PasswordChangeModal( {
	isOpen,
	onClose,
}: PasswordChangeModalProps ) {
	const [ newPassword, setNewPassword ] = useState( '' );
	const [ confirmPassword, setConfirmPassword ] = useState( '' );
	const [ isSaving, setIsSaving ] = useState( false );
	const [ errorMessage, setErrorMessage ] = useState< string | null >( null );
	const [ isDone, setIsDone ] = useState( false );

	if ( ! isOpen ) {
		return null;
	}

	const handleClose = () => {
		setNewPassword( '' );
		setConfirmPassword( '' );
		setErrorMessage( null );
		setIsDone( false );
		onClose();
	};

	const submit = async ( event: React.FormEvent ) => {
		event.preventDefault();
		setIsSaving( true );
		setErrorMessage( null );

		try {
			await apiFetch( {
				path: '/nutrio/v1/me/password',
				method: 'POST',
				data: {
					new_password: newPassword,
					confirm_password: confirmPassword,
				},
			} );
			setIsDone( true );
		} catch ( error ) {
			const message =
				error &&
				typeof error === 'object' &&
				'message' in error &&
				typeof error.message === 'string'
					? error.message
					: __(
							'Something went wrong — please try again.',
							'nutrio'
					  );
			setErrorMessage( message );
		} finally {
			setIsSaving( false );
		}
	};

	return (
		<div
			className={ styles.modalScrim }
			role="button"
			tabIndex={ -1 }
			aria-label={ __( 'Close', 'nutrio' ) }
			onClick={ ( e ) => e.target === e.currentTarget && handleClose() }
			onKeyDown={ ( event ) => {
				if ( 'Escape' === event.key ) {
					handleClose();
				}
			} }
		>
			<div className={ styles.modal }>
				<h3>{ __( 'Change Password', 'nutrio' ) }</h3>
				{ isDone ? (
					<>
						<p>
							{ __(
								'Your password has been changed.',
								'nutrio'
							) }
						</p>
						<Button variant="primary" onClick={ handleClose }>
							{ __( 'Done', 'nutrio' ) }
						</Button>
					</>
				) : (
					<form onSubmit={ submit } className={ styles.form }>
						{ errorMessage && (
							<p className={ styles.error }>{ errorMessage }</p>
						) }
						<div className="nutrio-field">
							<label htmlFor="nutrio-new-password">
								{ __( 'New Password', 'nutrio' ) }
							</label>
							<input
								id="nutrio-new-password"
								type="password"
								value={ newPassword }
								onChange={ ( event ) =>
									setNewPassword( event.target.value )
								}
								required
								minLength={ 8 }
							/>
						</div>
						<div className="nutrio-field">
							<label htmlFor="nutrio-confirm-password">
								{ __( 'Confirm New Password', 'nutrio' ) }
							</label>
							<input
								id="nutrio-confirm-password"
								type="password"
								value={ confirmPassword }
								onChange={ ( event ) =>
									setConfirmPassword( event.target.value )
								}
								required
								minLength={ 8 }
							/>
						</div>
						<div className={ styles.actions }>
							<Button
								type="submit"
								variant="primary"
								disabled={ isSaving }
							>
								{ __( 'Save Password', 'nutrio' ) }
							</Button>
							<Button
								type="button"
								variant="ghost"
								onClick={ handleClose }
								disabled={ isSaving }
							>
								{ __( 'Cancel', 'nutrio' ) }
							</Button>
						</div>
					</form>
				) }
			</div>
		</div>
	);
}
