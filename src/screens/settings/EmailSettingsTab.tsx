import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import EmailTemplateEditor from '../../components/settings/EmailTemplateEditor';
import ProUpsellModal from '../../components/ui/ProUpsellModal';
import Panel, { PanelBody, PanelHead } from '../../components/ui/Panel';
import { alertDialog } from '../../utils/confirmDialog';
import type { EmailDigestSettings, EmailTemplate } from '../../types';
import styles from './EmailSettingsTab.module.css';

interface EmailSettingsTabProps {
	audience: 'practitioner' | 'client';
}

// One label per known type — kept here rather than derived, since the
// registry only sends machine keys (see EmailTemplateRegistry) and
// this is the one place that turns them into copy a practitioner reads.
const TYPE_LABELS: Record< string, string > = {
	client_invite: __( 'Client invite', 'nutrio' ),
	client_password_reset: __( 'Client password reset', 'nutrio' ),
	client_plan_assigned: __( 'Plan assigned', 'nutrio' ),
	practitioner_client_added: __( 'New client added', 'nutrio' ),
	practitioner_daily_digest: __( 'Daily client activity digest', 'nutrio' ),
};

export default function EmailSettingsTab( { audience }: EmailSettingsTabProps ) {
	const [ templates, setTemplates ] = useState< EmailTemplate[] | null >( null );
	const [ digest, setDigest ] = useState< EmailDigestSettings | null >( null );
	const [ isProModalOpen, setProModalOpen ] = useState( false );

	useEffect( () => {
		apiFetch< EmailTemplate[] >( { path: '/nutrio/v1/settings/email-templates' } ).then(
			setTemplates
		);

		if ( 'practitioner' === audience ) {
			apiFetch< EmailDigestSettings >( {
				path: '/nutrio/v1/settings/email-digest',
			} ).then( setDigest );
		}
	}, [ audience ] );

	const handleSaveTemplate = async ( type: string, subject: string, body: string ) => {
		const result = await apiFetch< { type: string; subject: string; body: string } >( {
			path: `/nutrio/v1/settings/email-templates/${ type }`,
			method: 'PUT',
			data: { subject, body },
		} );

		setTemplates( ( previous ) =>
			( previous ?? [] ).map( ( template ) =>
				template.type === type
					? { ...template, subject: result.subject, body: result.body }
					: template
			)
		);

		await alertDialog( { message: __( 'Email template saved.', 'nutrio' ) } );
	};

	const handleSaveDigest = async ( next: EmailDigestSettings ) => {
		const result = await apiFetch< EmailDigestSettings >( {
			path: '/nutrio/v1/settings/email-digest',
			method: 'PUT',
			data: next,
		} );
		setDigest( result );
	};

	if ( null === templates ) {
		return <p>{ __( 'Loading…', 'nutrio' ) }</p>;
	}

	const visibleTemplates = templates.filter( ( template ) => template.audience === audience );

	return (
		<>
			{ 'practitioner' === audience && null !== digest && (
				<Panel>
					<PanelHead>
						<h3>{ __( 'Daily client activity digest', 'nutrio' ) }</h3>
					</PanelHead>
					<PanelBody>
						<label className={ styles.digestRow }>
							<input
								type="checkbox"
								checked={ digest.enabled }
								onChange={ ( event ) =>
									handleSaveDigest( { ...digest, enabled: event.target.checked } )
								}
							/>
							{ __( 'Send me a daily summary of client activity', 'nutrio' ) }
						</label>
						<label className={ styles.digestRow }>
							{ __( 'Send at', 'nutrio' ) }
							<input
								type="time"
								value={ digest.send_time }
								onChange={ ( event ) =>
									handleSaveDigest( { ...digest, send_time: event.target.value } )
								}
							/>
						</label>
					</PanelBody>
				</Panel>
			) }

			{ visibleTemplates.map( ( template ) => (
				<EmailTemplateEditor
					key={ template.type }
					template={ template }
					label={ TYPE_LABELS[ template.type ] ?? template.type }
					onSave={ handleSaveTemplate }
				/>
			) ) }

			<button
				type="button"
				className={ styles.lockedRow }
				onClick={ () => setProModalOpen( true ) }
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
					<rect x="5" y="11" width="14" height="9" rx="2" fill="currentColor" stroke="none" />
					<path d="M8 11V8a4 4 0 0 1 8 0v3" />
				</svg>
				{ __( 'Custom email styling', 'nutrio' ) }
			</button>

			<ProUpsellModal
				isOpen={ isProModalOpen }
				featureName={ __( 'Custom email styling', 'nutrio' ) }
				onClose={ () => setProModalOpen( false ) }
			/>
		</>
	);
}
