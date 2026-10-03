import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import EmailTemplateEditor from '../../components/settings/EmailTemplateEditor';
import { errorMessage, toast } from '../../utils/toast';
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

// client_invite/client_password_reset are triggered by WordPress core
// itself and always send — no toggle for those. The daily digest has
// its own separate enabled/send_time mechanism (see the digest-specific
// wiring below), not the generic per-type toggle.
const TOGGLEABLE_TYPES = new Set( [
	'client_plan_assigned',
	'practitioner_client_added',
] );

export default function EmailSettingsTab( {
	audience,
}: EmailSettingsTabProps ) {
	const [ templates, setTemplates ] = useState< EmailTemplate[] | null >(
		null
	);
	const [ digest, setDigest ] = useState< EmailDigestSettings | null >(
		null
	);
	useEffect( () => {
		apiFetch< EmailTemplate[] >( {
			path: '/nutrio/v1/settings/email-templates',
		} ).then( setTemplates );

		if ( 'practitioner' === audience ) {
			apiFetch< EmailDigestSettings >( {
				path: '/nutrio/v1/settings/email-digest',
			} ).then( setDigest );
		}
	}, [ audience ] );

	const handleSaveTemplate = async (
		type: string,
		subject: string,
		body: string
	) => {
		let result: { type: string; subject: string; body: string };

		try {
			result = await apiFetch< {
				type: string;
				subject: string;
				body: string;
			} >( {
				path: `/nutrio/v1/settings/email-templates/${ type }`,
				method: 'PUT',
				data: { subject, body },
			} );
		} catch ( error ) {
			toast.error(
				errorMessage(
					error,
					__( 'Could not save the email template.', 'nutrio' )
				)
			);
			return;
		}

		setTemplates( ( previous ) =>
			( previous ?? [] ).map( ( template ) =>
				template.type === type
					? {
							...template,
							subject: result.subject,
							body: result.body,
					  }
					: template
			)
		);

		toast.success( __( 'Email template saved.', 'nutrio' ) );
	};

	const handleToggleTemplate = async ( type: string, enabled: boolean ) => {
		let result: { type: string; enabled: boolean };

		try {
			result = await apiFetch< { type: string; enabled: boolean } >( {
				path: `/nutrio/v1/settings/email-templates/${ type }/enabled`,
				method: 'PUT',
				data: { enabled },
			} );
		} catch ( error ) {
			toast.error(
				errorMessage(
					error,
					__( 'Could not update this email.', 'nutrio' )
				)
			);
			return;
		}

		setTemplates( ( previous ) =>
			( previous ?? [] ).map( ( template ) =>
				template.type === type
					? { ...template, enabled: result.enabled }
					: template
			)
		);
		toast.success(
			result.enabled
				? __( 'Email enabled.', 'nutrio' )
				: __( 'Email disabled.', 'nutrio' )
		);
	};

	const handleSaveDigest = async ( next: EmailDigestSettings ) => {
		try {
			const result = await apiFetch< EmailDigestSettings >( {
				path: '/nutrio/v1/settings/email-digest',
				method: 'PUT',
				data: next,
			} );
			setDigest( result );
			if ( digest && next.enabled === digest.enabled ) {
				toast.success( __( 'Digest send time saved.', 'nutrio' ) );
			} else {
				toast.success(
					next.enabled
						? __( 'Daily digest enabled.', 'nutrio' )
						: __( 'Daily digest disabled.', 'nutrio' )
				);
			}
		} catch ( error ) {
			toast.error(
				errorMessage(
					error,
					__( 'Could not save the digest settings.', 'nutrio' )
				)
			);
		}
	};

	if ( null === templates ) {
		return <p>{ __( 'Loading…', 'nutrio' ) }</p>;
	}

	const visibleTemplates = templates.filter(
		( template ) => template.audience === audience
	);

	return (
		<>
			{ visibleTemplates.map( ( template ) => {
				const isDigest = 'practitioner_daily_digest' === template.type;

				let onToggleEnabled;
				if ( isDigest ) {
					onToggleEnabled =
						null !== digest
							? ( enabled: boolean ) =>
									handleSaveDigest( { ...digest, enabled } )
							: undefined;
				} else if ( TOGGLEABLE_TYPES.has( template.type ) ) {
					onToggleEnabled = ( enabled: boolean ) =>
						handleToggleTemplate( template.type, enabled );
				}

				const digestTimeInputId = `nutrio-digest-send-time-${ template.type }`;

				return (
					<EmailTemplateEditor
						key={ template.type }
						template={ template }
						label={ TYPE_LABELS[ template.type ] ?? template.type }
						onSave={ handleSaveTemplate }
						onToggleEnabled={ onToggleEnabled }
						extraFields={
							isDigest && null !== digest ? (
								<label
									className={ styles.digestTimeRow }
									htmlFor={ digestTimeInputId }
								>
									{ __( 'Send at', 'nutrio' ) }
									<input
										id={ digestTimeInputId }
										type="time"
										value={ digest.send_time }
										onChange={ ( event ) =>
											handleSaveDigest( {
												...digest,
												send_time: event.target.value,
											} )
										}
									/>
								</label>
							) : undefined
						}
					/>
				);
			} ) }
		</>
	);
}
