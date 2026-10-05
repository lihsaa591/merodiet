import { useState } from '@wordpress/element';
import type { ReactNode } from 'react';
import { __ } from '@wordpress/i18n';
import Panel, { PanelBody, PanelHead } from '../ui/Panel';
import Button from '../ui/Button';
import Switch from '../ui/Switch';
import { toast } from '../../utils/toast';
import EmailBodyEditor from './EmailBodyEditor';
import type { EmailTemplate } from '../../types';
import styles from './EmailTemplateEditor.module.css';

interface EmailTemplateEditorProps {
	template: EmailTemplate;
	label: string;
	onSave: ( type: string, subject: string, body: string ) => Promise< void >;
	/**
	 * Omitted for client_invite/client_password_reset — those are
	 * triggered by WordPress core itself and always send, so there's
	 * nothing to toggle. When present, the header shows an enable
	 * checkbox wired to this handler instead of the type's own
	 * enabled/disabled REST flag (the daily digest passes its own
	 * separate enabled/send_time handler here — see EmailSettingsTab).
	 */
	onToggleEnabled?: ( enabled: boolean ) => Promise< void >;
	/** Rendered inside the expanded body, above the tag row — the digest's send-time picker uses this. */
	extraFields?: ReactNode;
}

// One email type's collapsed-by-default accordion row: a header (label +
// optional enable toggle + expand/collapse chevron) and, when expanded,
// the subject field and the body editor (visual/code, with insert-tag
// buttons — see EmailBodyEditor).
export default function EmailTemplateEditor( {
	template,
	label,
	onSave,
	onToggleEnabled,
	extraFields,
}: EmailTemplateEditorProps ) {
	const [ isExpanded, setIsExpanded ] = useState( false );
	const [ subject, setSubject ] = useState( template.subject );
	const [ body, setBody ] = useState( template.body );
	const [ isSaving, setIsSaving ] = useState( false );
	const [ isToggling, setIsToggling ] = useState( false );

	const handleSave = async ( event: React.FormEvent ) => {
		event.preventDefault();

		if ( subject === template.subject && body === template.body ) {
			toast.info( __( 'No changes to save.', 'merodiet' ) );
			return;
		}

		setIsSaving( true );
		try {
			await onSave( template.type, subject, body );
		} finally {
			setIsSaving( false );
		}
	};

	const handleToggle = async ( checked: boolean ) => {
		if ( ! onToggleEnabled ) {
			return;
		}
		setIsToggling( true );
		try {
			await onToggleEnabled( checked );
		} finally {
			setIsToggling( false );
		}
	};

	return (
		<Panel className={ styles.accordionItem }>
			<PanelHead className={ styles.panelHead }>
				<button
					type="button"
					className={ styles.headerRow }
					onClick={ () =>
						setIsExpanded( ( previous ) => ! previous )
					}
					aria-expanded={ isExpanded }
				>
					<svg
						className={ `${ styles.chevron } ${
							isExpanded ? styles.chevronOpen : ''
						}` }
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						aria-hidden="true"
					>
						<path d="M9 6l6 6-6 6" />
					</svg>
					<h3>{ label }</h3>
				</button>
				{ onToggleEnabled && (
					<span
						role="presentation"
						className={ styles.enableToggle }
						onClick={ ( event ) => event.stopPropagation() }
						onKeyDown={ ( event ) => event.stopPropagation() }
					>
						<Switch
							checked={ template.enabled }
							disabled={ isToggling }
							onChange={ handleToggle }
							label={ __( 'Enabled', 'merodiet' ) }
						/>
					</span>
				) }
			</PanelHead>
			{ isExpanded && (
				<PanelBody className={ styles.panelBody }>
					<form onSubmit={ handleSave } className={ styles.form }>
						{ extraFields }
						<div className="merodiet-field">
							<label
								htmlFor={ `merodiet-email-subject-${ template.type }` }
							>
								{ __( 'Subject', 'merodiet' ) }
							</label>
							<input
								id={ `merodiet-email-subject-${ template.type }` }
								type="text"
								value={ subject }
								onChange={ ( event ) =>
									setSubject( event.target.value )
								}
								required
							/>
						</div>
						<EmailBodyEditor
							id={ template.type }
							value={ body }
							onChange={ setBody }
							tags={ template.tags }
						/>
						<Button
							variant="primary"
							type="submit"
							disabled={ isSaving || '' === body.trim() }
							className={ styles.saveButton }
						>
							{ __( 'Save', 'merodiet' ) }
						</Button>
					</form>
				</PanelBody>
			) }
		</Panel>
	);
}
