import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import Drawer from '../components/ui/Drawer';
import Button from '../components/ui/Button';
import PasswordChangeModal from './PasswordChangeModal';
import type { Client } from '../types';
import styles from './ProfileDrawer.module.css';

interface ProfileDrawerProps {
	isOpen: boolean;
	onClose: () => void;
	client: Client | null;
	onClientUpdate: ( client: Client ) => void;
}

interface FormValues {
	first_name: string;
	last_name: string;
	email: string;
	goals: string;
	dietary_restrictions: string;
	allergies: string;
}

const EMPTY: FormValues = {
	first_name: '',
	last_name: '',
	email: '',
	goals: '',
	dietary_restrictions: '',
	allergies: '',
};

export default function ProfileDrawer( {
	isOpen,
	onClose,
	client,
	onClientUpdate,
}: ProfileDrawerProps ) {
	const [ values, setValues ] = useState< FormValues >( EMPTY );
	const [ isSaving, setIsSaving ] = useState( false );
	const [ isUploadingAvatar, setIsUploadingAvatar ] = useState( false );
	const [ errorMessage, setErrorMessage ] = useState< string | null >( null );
	const [ successMessage, setSuccessMessage ] = useState< string | null >(
		null
	);
	const [ loadError, setLoadError ] = useState< string | null >( null );
	const [ isPasswordModalOpen, setPasswordModalOpen ] = useState( false );
	const [ avatarPreviewUrl, setAvatarPreviewUrl ] = useState< string | null >(
		null
	);
	const [ isViewingAvatar, setIsViewingAvatar ] = useState( false );

	// Revoke the local object URL whenever it's replaced or the drawer unmounts.
	useEffect( () => {
		return () => {
			if ( avatarPreviewUrl ) {
				URL.revokeObjectURL( avatarPreviewUrl );
			}
		};
	}, [ avatarPreviewUrl ] );

	const applyClient = ( data: Client ) => {
		onClientUpdate( data );
		setValues( {
			first_name: data.first_name,
			last_name: data.last_name,
			email: data.email,
			goals: data.goals ?? '',
			dietary_restrictions: data.dietary_restrictions ?? '',
			allergies: data.allergies.join( ', ' ),
		} );
	};

	useEffect( () => {
		if ( ! isOpen ) {
			return;
		}

		if ( client ) {
			applyClient( client );
			return;
		}

		let cancelled = false;
		setLoadError( null );

		apiFetch< Client >( { path: '/nutrio/v1/me/profile' } )
			.then( ( data ) => {
				if ( ! cancelled ) {
					applyClient( data );
				}
			} )
			.catch( () => {
				if ( ! cancelled ) {
					setLoadError(
						__(
							'Could not load your profile — please try again.',
							'nutrio'
						)
					);
				}
			} );

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the drawer opens, not on every client/applyClient identity change.
	}, [ isOpen ] );

	// Self-dismissing success toast, cleared whenever a new one is shown.
	useEffect( () => {
		if ( ! successMessage ) {
			return;
		}

		const timer = setTimeout( () => setSuccessMessage( null ), 2500 );
		return () => clearTimeout( timer );
	}, [ successMessage ] );

	const setField =
		( field: keyof FormValues ) =>
		(
			event: React.ChangeEvent< HTMLInputElement | HTMLTextAreaElement >
		) =>
			setValues( ( prev ) => ( {
				...prev,
				[ field ]: event.target.value,
			} ) );

	const handleSubmit = async ( event: React.FormEvent ) => {
		event.preventDefault();
		setIsSaving( true );
		setErrorMessage( null );

		try {
			const updated = await apiFetch< Client >( {
				path: '/nutrio/v1/me/profile',
				method: 'PATCH',
				data: {
					first_name: values.first_name,
					last_name: values.last_name,
					email: values.email,
					goals: values.goals,
					dietary_restrictions: values.dietary_restrictions,
					allergies: values.allergies
						.split( ',' )
						.map( ( item ) => item.trim() )
						.filter( Boolean ),
				},
			} );
			applyClient( updated );
			setSuccessMessage( __( 'Saved.', 'nutrio' ) );
		} catch {
			setErrorMessage(
				__( 'Something went wrong — please try again.', 'nutrio' )
			);
		} finally {
			setIsSaving( false );
		}
	};

	const handleAvatarChange = async (
		event: React.ChangeEvent< HTMLInputElement >
	) => {
		const file = event.target.files?.[ 0 ];

		if ( ! file ) {
			return;
		}

		// Show the picked file immediately, before the upload round-trip
		// finishes, so "Change photo" feels instant.
		setAvatarPreviewUrl( URL.createObjectURL( file ) );
		setIsUploadingAvatar( true );
		setErrorMessage( null );

		try {
			const formData = new FormData();
			formData.append( 'avatar', file );

			const updated = await apiFetch< Client >( {
				path: '/nutrio/v1/me/profile/avatar',
				method: 'POST',
				body: formData,
			} );
			applyClient( updated );
			setSuccessMessage( __( 'Photo updated.', 'nutrio' ) );
		} catch {
			setAvatarPreviewUrl( null );
			setErrorMessage(
				__(
					'Could not upload that image — please try a JPEG, PNG, or WebP file.',
					'nutrio'
				)
			);
		} finally {
			setIsUploadingAvatar( false );
			event.target.value = '';
		}
	};

	return (
		<>
			<Drawer
				isOpen={ isOpen }
				title={ __( 'My Profile', 'nutrio' ) }
				onClose={ onClose }
			>
				{ successMessage && (
					<div className={ styles.toast } role="status">
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.5"
						>
							<path d="M5 13l4 4L19 7" />
						</svg>
						{ successMessage }
					</div>
				) }
				{ loadError && <p className={ styles.error }>{ loadError }</p> }
				{ ! loadError && ! client && (
					<p>{ __( 'Loading…', 'nutrio' ) }</p>
				) }
				{ ! loadError && client && (
					<form onSubmit={ handleSubmit } className={ styles.form }>
						{ errorMessage && (
							<p className={ styles.error }>{ errorMessage }</p>
						) }

						<div className={ styles.avatarRow }>
							{ avatarPreviewUrl || client.avatar_url ? (
								<button
									type="button"
									className={ styles.avatarViewBtn }
									onClick={ () => setIsViewingAvatar( true ) }
									aria-label={ __(
										'View profile photo',
										'nutrio'
									) }
								>
									<img
										src={
											avatarPreviewUrl ??
											client.avatar_url ??
											''
										}
										alt=""
										className={ styles.avatarImage }
									/>
								</button>
							) : (
								<div className={ styles.avatarPlaceholder }>
									{ ( client.first_name[ 0 ] ?? '' ) +
										( client.last_name[ 0 ] ?? '' ) }
								</div>
							) }
							<label
								className={ styles.avatarUpload }
								htmlFor="nutrio-profile-avatar"
							>
								{ isUploadingAvatar
									? __( 'Uploading…', 'nutrio' )
									: __( 'Change photo', 'nutrio' ) }
								<input
									id="nutrio-profile-avatar"
									type="file"
									accept="image/jpeg,image/png,image/webp"
									onChange={ handleAvatarChange }
									disabled={ isUploadingAvatar }
									hidden
								/>
							</label>
						</div>

						<div className="nutrio-field">
							<label htmlFor="nutrio-profile-first-name">
								{ __( 'First name', 'nutrio' ) }
							</label>
							<input
								id="nutrio-profile-first-name"
								type="text"
								value={ values.first_name }
								onChange={ setField( 'first_name' ) }
								required
							/>
						</div>
						<div className="nutrio-field">
							<label htmlFor="nutrio-profile-last-name">
								{ __( 'Last name', 'nutrio' ) }
							</label>
							<input
								id="nutrio-profile-last-name"
								type="text"
								value={ values.last_name }
								onChange={ setField( 'last_name' ) }
								required
							/>
						</div>
						<div className="nutrio-field">
							<label htmlFor="nutrio-profile-email">
								{ __( 'Email', 'nutrio' ) }
							</label>
							<input
								id="nutrio-profile-email"
								type="email"
								value={ values.email }
								onChange={ setField( 'email' ) }
								required
							/>
						</div>
						<div className="nutrio-field">
							<label htmlFor="nutrio-profile-goals">
								{ __( 'Goals', 'nutrio' ) }
							</label>
							<textarea
								id="nutrio-profile-goals"
								rows={ 3 }
								value={ values.goals }
								onChange={ setField( 'goals' ) }
							/>
						</div>
						<div className="nutrio-field">
							<label htmlFor="nutrio-profile-dietary">
								{ __( 'Dietary restrictions', 'nutrio' ) }
							</label>
							<textarea
								id="nutrio-profile-dietary"
								rows={ 2 }
								value={ values.dietary_restrictions }
								onChange={ setField( 'dietary_restrictions' ) }
							/>
						</div>
						<div className="nutrio-field">
							<label htmlFor="nutrio-profile-allergies">
								{ __( 'Allergies', 'nutrio' ) }
							</label>
							<input
								id="nutrio-profile-allergies"
								type="text"
								value={ values.allergies }
								onChange={ setField( 'allergies' ) }
								placeholder={ __(
									'Peanuts, shellfish',
									'nutrio'
								) }
							/>
							<div className="nutrio-field-hint">
								{ __( 'Comma-separated', 'nutrio' ) }
							</div>
						</div>

						<Button
							type="submit"
							variant="primary"
							disabled={ isSaving }
						>
							{ __( 'Save', 'nutrio' ) }
						</Button>

						<button
							type="button"
							className={ styles.passwordLink }
							onClick={ () => setPasswordModalOpen( true ) }
						>
							{ __( 'Change password', 'nutrio' ) }
						</button>
					</form>
				) }
			</Drawer>

			<PasswordChangeModal
				isOpen={ isPasswordModalOpen }
				onClose={ () => setPasswordModalOpen( false ) }
			/>

			{ isViewingAvatar && ( avatarPreviewUrl || client?.avatar_url ) && (
				<div
					className={ styles.lightboxScrim }
					role="button"
					tabIndex={ -1 }
					aria-label={ __( 'Close', 'nutrio' ) }
					onClick={ () => setIsViewingAvatar( false ) }
					onKeyDown={ ( event ) => {
						if ( 'Escape' === event.key ) {
							setIsViewingAvatar( false );
						}
					} }
				>
					<img
						src={ avatarPreviewUrl ?? client?.avatar_url ?? '' }
						alt=""
						className={ styles.lightboxImage }
					/>
				</div>
			) }
		</>
	);
}
