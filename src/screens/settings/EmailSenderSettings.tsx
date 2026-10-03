import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import Panel, { PanelBody, PanelHead } from '../../components/ui/Panel';
import Button from '../../components/ui/Button';
import ProUpsellModal from '../../components/ui/ProUpsellModal';
import { errorMessage, toast } from '../../utils/toast';
import type { EmailSenderSettings as EmailSenderSettingsData } from '../../types';
import styles from './EmailSenderSettings.module.css';

const PRO_FEATURE_NAME = __( 'Custom email styling', 'nutrio' );

// The form shows what emails will actually be sent from: the saved
// override, or WordPress's own default when nothing is saved.
function toFormValues( settings: EmailSenderSettingsData ) {
	return {
		fromName: settings.from_name || settings.defaults.from_name,
		fromAddress: settings.from_address || settings.defaults.from_address,
	};
}

// The one site-wide "who do emails come from" setting, shared by every
// email type (practitioner and client), so it lives above the audience
// sub-tabs. From name/address are free; the header colour and logo are a
// Pro showcase that opens the shared upsell modal.
export default function EmailSenderSettings() {
	const [ saved, setSaved ] = useState< EmailSenderSettingsData | null >(
		null
	);
	const [ fromName, setFromName ] = useState( '' );
	const [ fromAddress, setFromAddress ] = useState( '' );
	const [ isSaving, setIsSaving ] = useState( false );
	const [ isProModalOpen, setProModalOpen ] = useState( false );

	useEffect( () => {
		apiFetch< EmailSenderSettingsData >( {
			path: '/nutrio/v1/settings/email-sender',
		} ).then( ( result ) => {
			const values = toFormValues( result );
			setSaved( result );
			setFromName( values.fromName );
			setFromAddress( values.fromAddress );
		} );
	}, [] );

	if ( null === saved ) {
		return null;
	}

	const savedValues = toFormValues( saved );
	const isDirty =
		fromName !== savedValues.fromName ||
		fromAddress !== savedValues.fromAddress;

	const handleSubmit = async ( event: React.FormEvent ) => {
		event.preventDefault();
		setIsSaving( true );

		try {
			const result = await apiFetch< EmailSenderSettingsData >( {
				path: '/nutrio/v1/settings/email-sender',
				method: 'PUT',
				// Sending the default back would pin it as an override, so
				// treat an unchanged default (or an empty field) as "unset".
				data: {
					from_name:
						fromName.trim() === saved.defaults.from_name
							? ''
							: fromName.trim(),
					from_address:
						fromAddress.trim() === saved.defaults.from_address
							? ''
							: fromAddress.trim(),
				},
			} );
			const values = toFormValues( result );
			setSaved( result );
			setFromName( values.fromName );
			setFromAddress( values.fromAddress );
			toast.success( __( 'Sender saved.', 'nutrio' ) );
		} catch ( error ) {
			toast.error(
				errorMessage(
					error,
					__( 'Could not save the sender.', 'nutrio' )
				)
			);
		} finally {
			setIsSaving( false );
		}
	};

	return (
		<>
			<Panel className={ styles.panel }>
				<PanelHead>
					<h3>{ __( 'Sender', 'nutrio' ) }</h3>
				</PanelHead>
				<PanelBody>
					<p className={ styles.intro }>
						{ __(
							'Who your emails come from. Applies to every email below, for both practitioners and clients. Pre-filled with the WordPress default; change either to override it.',
							'nutrio'
						) }
					</p>
					<form onSubmit={ handleSubmit } className={ styles.form }>
						<div className={ styles.fields }>
							<div className="nutrio-field">
								<label htmlFor="nutrio-email-from-name">
									{ __( 'From name', 'nutrio' ) }
								</label>
								<input
									id="nutrio-email-from-name"
									type="text"
									value={ fromName }
									placeholder={ saved.defaults.from_name }
									onChange={ ( event ) =>
										setFromName( event.target.value )
									}
								/>
							</div>
							<div className="nutrio-field">
								<label htmlFor="nutrio-email-from-address">
									{ __( 'From address', 'nutrio' ) }
								</label>
								<input
									id="nutrio-email-from-address"
									type="email"
									value={ fromAddress }
									placeholder={ saved.defaults.from_address }
									onChange={ ( event ) =>
										setFromAddress( event.target.value )
									}
									aria-describedby="nutrio-email-from-address-help"
								/>
							</div>
						</div>
						<p
							id="nutrio-email-from-address-help"
							className={ styles.help }
						>
							{ __(
								'Use an address on your own domain. Many mail servers reject or spam-folder mail sent from an address they do not recognise.',
								'nutrio'
							) }
						</p>
						<div className={ styles.actions }>
							<Button
								variant="primary"
								type="submit"
								disabled={ isSaving || ! isDirty }
							>
								{ __( 'Save', 'nutrio' ) }
							</Button>
						</div>
					</form>

					<button
						type="button"
						className={ styles.proRow }
						onClick={ () => setProModalOpen( true ) }
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							aria-hidden="true"
						>
							<rect
								x="5"
								y="11"
								width="14"
								height="9"
								rx="2"
								fill="currentColor"
								stroke="none"
							/>
							<path d="M8 11V8a4 4 0 0 1 8 0v3" />
						</svg>
						<span className={ styles.proText }>
							<span className={ styles.proTitle }>
								{ PRO_FEATURE_NAME }
							</span>
							<span className={ styles.proDetail }>
								{ __(
									'Header colour and your own logo',
									'nutrio'
								) }
							</span>
						</span>
						<span
							className={ styles.proPreview }
							aria-hidden="true"
						>
							<span className={ styles.swatch } />
							<span className={ styles.logoBox } />
						</span>
						<span className={ styles.proBadge }>
							{ __( 'Pro', 'nutrio' ) }
						</span>
					</button>
				</PanelBody>
			</Panel>

			<ProUpsellModal
				isOpen={ isProModalOpen }
				featureName={ PRO_FEATURE_NAME }
				onClose={ () => setProModalOpen( false ) }
			/>
		</>
	);
}
