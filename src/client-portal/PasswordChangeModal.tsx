import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import Button from '../components/ui/Button';
import styles from './PasswordChangeModal.module.css';
import { nonceMiddleware } from './nonceMiddleware';
import { errorMessage, toast } from '../utils/toast';

interface PasswordChangeModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export default function PasswordChangeModal( {
	isOpen,
	onClose,
}: PasswordChangeModalProps ) {
	const [ currentPassword, setCurrentPassword ] = useState( '' );
	const [ newPassword, setNewPassword ] = useState( '' );
	const [ confirmPassword, setConfirmPassword ] = useState( '' );
	const [ isSaving, setIsSaving ] = useState( false );
	const [ isDone, setIsDone ] = useState( false );

	if ( ! isOpen ) {
		return null;
	}

	const handleClose = () => {
		setCurrentPassword( '' );
		setNewPassword( '' );
		setConfirmPassword( '' );
		setIsDone( false );
		onClose();
	};

	const submit = async ( event: React.FormEvent ) => {
		event.preventDefault();
		setIsSaving( true );

		try {
			const response = await apiFetch< {
				changed: boolean;
				nonce: string;
			} >( {
				path: '/merodiet/v1/me/password',
				method: 'POST',
				data: {
					current_password: currentPassword,
					new_password: newPassword,
					confirm_password: confirmPassword,
				},
			} );
			// The password change re-authenticates the session, which
			// rotates the token the old REST nonce was bound to.
			nonceMiddleware.nonce = response.nonce;
			setIsDone( true );
		} catch ( error ) {
			toast.error(
				errorMessage(
					error,
					__( 'Something went wrong — please try again.', 'merodiet' )
				)
			);
		} finally {
			setIsSaving( false );
		}
	};

	return (
		<div
			className={ styles.modalScrim }
			role="button"
			tabIndex={ -1 }
			aria-label={ __( 'Close', 'merodiet' ) }
			onClick={ ( e ) => e.target === e.currentTarget && handleClose() }
			onKeyDown={ ( event ) => {
				if ( 'Escape' === event.key ) {
					handleClose();
				}
			} }
		>
			<div className={ styles.modal }>
				<h3>{ __( 'Change Password', 'merodiet' ) }</h3>
				{ isDone ? (
					<>
						<p>
							{ __(
								'Your password has been changed.',
								'merodiet'
							) }
						</p>
						<Button variant="primary" onClick={ handleClose }>
							{ __( 'Done', 'merodiet' ) }
						</Button>
					</>
				) : (
					<form onSubmit={ submit } className={ styles.form }>
						<div className="merodiet-field">
							<label htmlFor="merodiet-current-password">
								{ __( 'Current Password', 'merodiet' ) }
							</label>
							<input
								id="merodiet-current-password"
								type="password"
								value={ currentPassword }
								onChange={ ( event ) =>
									setCurrentPassword( event.target.value )
								}
								required
							/>
						</div>
						<div className="merodiet-field">
							<label htmlFor="merodiet-new-password">
								{ __( 'New Password', 'merodiet' ) }
							</label>
							<input
								id="merodiet-new-password"
								type="password"
								value={ newPassword }
								onChange={ ( event ) =>
									setNewPassword( event.target.value )
								}
								required
								minLength={ 8 }
							/>
						</div>
						<div className="merodiet-field">
							<label htmlFor="merodiet-confirm-password">
								{ __( 'Confirm New Password', 'merodiet' ) }
							</label>
							<input
								id="merodiet-confirm-password"
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
								{ __( 'Save Password', 'merodiet' ) }
							</Button>
							<Button
								type="button"
								variant="ghost"
								onClick={ handleClose }
								disabled={ isSaving }
							>
								{ __( 'Cancel', 'merodiet' ) }
							</Button>
						</div>
					</form>
				) }
			</div>
		</div>
	);
}
