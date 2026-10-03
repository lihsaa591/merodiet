import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import Panel, { PanelBody, PanelHead } from '../../components/ui/Panel';
import Button from '../../components/ui/Button';
import ProUpsellModal from '../../components/ui/ProUpsellModal';
import type { EmailSenderSettings as EmailSenderSettingsData } from '../../types';
import styles from './EmailSenderSettings.module.css';

const PRO_FEATURE_NAME = __( 'Custom email styling', 'nutrio' );

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
	const [ message, setMessage ] = useState< {
		kind: 'success' | 'error';
		text: string;
	} | null >( null );
	const [ isProModalOpen, setProModalOpen ] = useState( false );

	useEffect( () => {
		apiFetch< EmailSenderSettingsData >( {
			path: '/nutrio/v1/settings/email-sender',
		} ).then( ( result ) => {
			setSaved( result );
			setFromName( result.from_name );
			setFromAddress( result.from_address );
		} );
	}, [] );

	// Self-dismissing success message.
	useEffect( () => {
		if ( 'success' !== message?.kind ) {
			return;
		}
		const timer = setTimeout( () => setMessage( null ), 2500 );
		return () => clearTimeout( timer );
	}, [ message ] );

	if ( null === saved ) {
		return null;
	}

	const isDirty =
		fromName !== saved.from_name || fromAddress !== saved.from_address;

	const handleSubmit = async ( event: React.FormEvent ) => {
		event.preventDefault();
		setIsSaving( true );
		setMessage( null );

		try {
			const result = await apiFetch< EmailSenderSettingsData >( {
				path: '/nutrio/v1/settings/email-sender',
				method: 'PUT',
				data: {
					from_name: fromName.trim(),
					from_address: fromAddress.trim(),
				},
			} );
			setSaved( result );
			setFromName( result.from_name );
			setFromAddress( result.from_address );
			setMessage( {
				kind: 'success',
				text: __( 'Sender saved.', 'nutrio' ),
			} );
		} catch ( error ) {
			setMessage( {
				kind: 'error',
				text:
					( error as { message?: string } )?.message ??
					__( 'Could not save the sender.', 'nutrio' ),
			} );
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
							'Who your emails come from. Applies to every email below, for both practitioners and clients. Leave a field empty to use the WordPress default.',
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
							{ message && (
								<span
									role={
										'error' === message.kind
											? 'alert'
											: 'status'
									}
									className={
										'error' === message.kind
											? styles.error
											: styles.success
									}
								>
									{ message.text }
								</span>
							) }
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
