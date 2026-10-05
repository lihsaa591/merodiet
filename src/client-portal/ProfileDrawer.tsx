import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import Drawer from '../components/ui/Drawer';
import Button from '../components/ui/Button';
import Skeleton from '../components/ui/Skeleton';
import PasswordChangeModal from './PasswordChangeModal';
import type { Client } from '../types';
import styles from './ProfileDrawer.module.css';
import { errorMessage, toast } from '../utils/toast';

// Mirrors the avatar row + a handful of field rows below it.
function ProfileDrawerSkeleton() {
	return (
		<div className={ styles.form }>
			<div className={ styles.avatarRow }>
				<Skeleton shape="circle" width="56px" height="56px" />
				<Skeleton width="90px" height="13px" />
			</div>
			{ [ 0, 1, 2, 3 ].map( ( row ) => (
				<div key={ row } className="merodiet-field">
					<Skeleton width="70px" height="11px" />
					<div style={ { marginTop: '6px' } }>
						<Skeleton width="100%" height="36px" shape="block" />
					</div>
				</div>
			) ) }
		</div>
	);
}

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

		apiFetch< Client >( { path: '/merodiet/v1/me/profile' } )
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
							'merodiet'
						)
					);
				}
			} );

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the drawer opens, not on every client/applyClient identity change.
	}, [ isOpen ] );

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

		try {
			const updated = await apiFetch< Client >( {
				path: '/merodiet/v1/me/profile',
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
			toast.success( __( 'Saved.', 'merodiet' ) );
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

		try {
			const formData = new FormData();
			formData.append( 'avatar', file );

			const updated = await apiFetch< Client >( {
				path: '/merodiet/v1/me/profile/avatar',
				method: 'POST',
				body: formData,
			} );
			applyClient( updated );
			toast.success( __( 'Photo updated.', 'merodiet' ) );
		} catch ( error ) {
			setAvatarPreviewUrl( null );
			toast.error(
				errorMessage(
					error,
					__(
						'Could not upload that image — please try a JPEG, PNG, or WebP file.',
						'merodiet'
					)
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
				title={ __( 'My Profile', 'merodiet' ) }
				onClose={ onClose }
			>
				{ loadError && <p className={ styles.error }>{ loadError }</p> }
				{ ! loadError && ! client && <ProfileDrawerSkeleton /> }
				{ ! loadError && client && (
					<form onSubmit={ handleSubmit } className={ styles.form }>
						<div className={ styles.avatarRow }>
							{ avatarPreviewUrl || client.avatar_url ? (
								<button
									type="button"
									className={ styles.avatarViewBtn }
									onClick={ () => setIsViewingAvatar( true ) }
									aria-label={ __(
										'View profile photo',
										'merodiet'
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
								htmlFor="merodiet-profile-avatar"
							>
								{ isUploadingAvatar
									? __( 'Uploading…', 'merodiet' )
									: __( 'Change photo', 'merodiet' ) }
								<input
									id="merodiet-profile-avatar"
									type="file"
									accept="image/jpeg,image/png,image/webp"
									onChange={ handleAvatarChange }
									disabled={ isUploadingAvatar }
									hidden
								/>
							</label>
						</div>

						<div className="merodiet-field">
							<label htmlFor="merodiet-profile-first-name">
								{ __( 'First name', 'merodiet' ) }
							</label>
							<input
								id="merodiet-profile-first-name"
								type="text"
								value={ values.first_name }
								onChange={ setField( 'first_name' ) }
								required
							/>
						</div>
						<div className="merodiet-field">
							<label htmlFor="merodiet-profile-last-name">
								{ __( 'Last name', 'merodiet' ) }
							</label>
							<input
								id="merodiet-profile-last-name"
								type="text"
								value={ values.last_name }
								onChange={ setField( 'last_name' ) }
								required
							/>
						</div>
						<div className="merodiet-field">
							<label htmlFor="merodiet-profile-email">
								{ __( 'Email', 'merodiet' ) }
							</label>
							<input
								id="merodiet-profile-email"
								type="email"
								value={ values.email }
								onChange={ setField( 'email' ) }
								required
							/>
						</div>
						<div className="merodiet-field">
							<label htmlFor="merodiet-profile-goals">
								{ __( 'Goals', 'merodiet' ) }
							</label>
							<textarea
								id="merodiet-profile-goals"
								rows={ 3 }
								value={ values.goals }
								onChange={ setField( 'goals' ) }
							/>
						</div>
						<div className="merodiet-field">
							<label htmlFor="merodiet-profile-dietary">
								{ __( 'Dietary restrictions', 'merodiet' ) }
							</label>
							<textarea
								id="merodiet-profile-dietary"
								rows={ 2 }
								value={ values.dietary_restrictions }
								onChange={ setField( 'dietary_restrictions' ) }
							/>
						</div>
						<div className="merodiet-field">
							<label htmlFor="merodiet-profile-allergies">
								{ __( 'Allergies', 'merodiet' ) }
							</label>
							<input
								id="merodiet-profile-allergies"
								type="text"
								value={ values.allergies }
								onChange={ setField( 'allergies' ) }
								placeholder={ __(
									'Peanuts, shellfish',
									'merodiet'
								) }
							/>
							<div className="merodiet-field-hint">
								{ __( 'Comma-separated', 'merodiet' ) }
							</div>
						</div>

						<Button
							type="submit"
							variant="primary"
							disabled={ isSaving }
						>
							{ __( 'Save', 'merodiet' ) }
						</Button>

						<button
							type="button"
							className={ styles.passwordLink }
							onClick={ () => setPasswordModalOpen( true ) }
						>
							{ __( 'Change password', 'merodiet' ) }
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
					aria-label={ __( 'Close', 'merodiet' ) }
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
