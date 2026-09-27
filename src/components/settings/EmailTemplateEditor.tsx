import { useRef, useState } from '@wordpress/element';
import type { ReactNode } from 'react';
import { __ } from '@wordpress/i18n';
import Panel, { PanelBody, PanelHead } from '../ui/Panel';
import Button from '../ui/Button';
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
// the subject/body editor with a row of insert-tag buttons below the
// body textarea — the "simple builder" the design spec calls for, not
// raw HTML editing.
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
	const bodyRef = useRef< HTMLTextAreaElement >( null );

	const insertTag = ( tag: string ) => {
		const textarea = bodyRef.current;
		if ( ! textarea ) {
			return;
		}
		const insertion = `{{${ tag }}}`;
		const start = textarea.selectionStart ?? body.length;
		const end = textarea.selectionEnd ?? body.length;
		const next = body.slice( 0, start ) + insertion + body.slice( end );
		setBody( next );
		// Restore focus + caret after the inserted tag on the next tick,
		// once React has re-rendered the textarea with the new value.
		requestAnimationFrame( () => {
			textarea.focus();
			const caret = start + insertion.length;
			textarea.setSelectionRange( caret, caret );
		} );
	};

	const handleSave = async ( event: React.FormEvent ) => {
		event.preventDefault();
		setIsSaving( true );
		try {
			await onSave( template.type, subject, body );
		} finally {
			setIsSaving( false );
		}
	};

	const handleToggle = async ( event: React.ChangeEvent< HTMLInputElement > ) => {
		if ( ! onToggleEnabled ) {
			return;
		}
		setIsToggling( true );
		try {
			await onToggleEnabled( event.target.checked );
		} finally {
			setIsToggling( false );
		}
	};

	return (
		<Panel>
			<PanelHead>
				<button
					type="button"
					className={ styles.headerRow }
					onClick={ () => setIsExpanded( ( previous ) => ! previous ) }
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
					<label
						className={ styles.enableToggle }
						onClick={ ( event ) => event.stopPropagation() }
					>
						<input
							type="checkbox"
							checked={ template.enabled }
							disabled={ isToggling }
							onChange={ handleToggle }
						/>
						{ __( 'Enabled', 'nutrio' ) }
					</label>
				) }
			</PanelHead>
			{ isExpanded && (
				<PanelBody>
					<form onSubmit={ handleSave } className={ styles.form }>
						{ extraFields }
						<div className="nutrio-field">
							<label htmlFor={ `nutrio-email-subject-${ template.type }` }>
								{ __( 'Subject', 'nutrio' ) }
							</label>
							<input
								id={ `nutrio-email-subject-${ template.type }` }
								type="text"
								value={ subject }
								onChange={ ( event ) => setSubject( event.target.value ) }
								required
							/>
						</div>
						<div className="nutrio-field">
							<label htmlFor={ `nutrio-email-body-${ template.type }` }>
								{ __( 'Body', 'nutrio' ) }
							</label>
							<textarea
								id={ `nutrio-email-body-${ template.type }` }
								ref={ bodyRef }
								rows={ 6 }
								value={ body }
								onChange={ ( event ) => setBody( event.target.value ) }
								required
							/>
						</div>
						<div className={ styles.tagRow }>
							{ Object.entries( template.tags ).map( ( [ tag, description ] ) => (
								<button
									key={ tag }
									type="button"
									className={ styles.tagButton }
									title={ description }
									onClick={ () => insertTag( tag ) }
								>
									{ `{{${ tag }}}` }
								</button>
							) ) }
						</div>
						<Button variant="primary" type="submit" disabled={ isSaving }>
							{ __( 'Save', 'nutrio' ) }
						</Button>
					</form>
				</PanelBody>
			) }
		</Panel>
	);
}
