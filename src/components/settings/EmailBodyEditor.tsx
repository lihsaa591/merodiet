import { useCallback, useEffect, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { serializeEmailBody } from '../../utils/emailBodyHtml';
import styles from './EmailBodyEditor.module.css';

/**
 * One button in the floating selection toolbar. The free editor ships
 * BASIC_FORMAT_ACTIONS; a richer editor (e.g. in Pro) can pass its own
 * list via the `formatActions` prop — each entry is a document.execCommand
 * name, so adding lists, links, etc. needs no change to this component.
 */
export interface FormatAction {
	id: string;
	label: string;
	/** document.execCommand command name, e.g. "bold". */
	command: string;
	/** Visible glyph for the button. */
	glyph: string;
	/** Matching CSS for the glyph, so B/I/U look like what they do. */
	glyphClassName?: string;
}

export const BASIC_FORMAT_ACTIONS: FormatAction[] = [
	{
		id: 'bold',
		label: __( 'Bold', 'merodiet' ),
		command: 'bold',
		glyph: 'B',
		glyphClassName: styles.glyphBold,
	},
	{
		id: 'italic',
		label: __( 'Italic', 'merodiet' ),
		command: 'italic',
		glyph: 'I',
		glyphClassName: styles.glyphItalic,
	},
	{
		id: 'underline',
		label: __( 'Underline', 'merodiet' ),
		command: 'underline',
		glyph: 'U',
		glyphClassName: styles.glyphUnderline,
	},
];

interface EmailBodyEditorProps {
	/** Used to build unique element ids. */
	id: string;
	/** The stored body: inline HTML where newlines are line breaks. */
	value: string;
	onChange: ( value: string ) => void;
	/** Merge tag name => description; each becomes an insert button. */
	tags: Record< string, string >;
	formatActions?: FormatAction[];
}

type Mode = 'visual' | 'code';

interface ToolbarState {
	top: number;
	left: number;
	active: Record< string, boolean >;
}

// The email body editor: a Visual mode that mirrors the real email's
// look (header band, body typography, footer — see
// Mailer::wrap_in_skeleton()) and is edited in place, and a Code mode
// for the raw HTML. Both edit the same stored string. Selecting text in
// Visual mode pops up a bold/italic/underline toolbar (Cmd/Ctrl+B/I/U
// also work natively).
export default function EmailBodyEditor( {
	id,
	value,
	onChange,
	tags,
	formatActions = BASIC_FORMAT_ACTIONS,
}: EmailBodyEditorProps ) {
	const [ mode, setMode ] = useState< Mode >( 'visual' );
	const [ toolbar, setToolbar ] = useState< ToolbarState | null >( null );
	const editableRef = useRef< HTMLDivElement >( null );
	const stageRef = useRef< HTMLDivElement >( null );
	const textareaRef = useRef< HTMLTextAreaElement >( null );
	// What the visual editor last reported via onChange. Lets the sync
	// effect below tell "the user just typed this" (leave the DOM alone,
	// or the caret jumps) from "the value changed from outside".
	const lastEmitted = useRef< string | null >( null );

	const siteName = window.merodietAdmin?.siteName ?? '';
	const logoUrl = window.merodietAdmin?.emailLogoUrl;

	// Push the value into the editable DOM on mount/mode switch/external
	// change only.
	useEffect( () => {
		const editable = editableRef.current;
		if ( 'visual' !== mode || ! editable ) {
			return;
		}
		if ( lastEmitted.current !== value ) {
			editable.innerHTML = value;
			lastEmitted.current = value;
		}
	}, [ value, mode ] );

	const emitFromEditable = useCallback( () => {
		const editable = editableRef.current;
		if ( ! editable ) {
			return;
		}
		const next = serializeEmailBody( editable );
		lastEmitted.current = next;
		onChange( next );
	}, [ onChange ] );

	const switchMode = ( next: Mode ) => {
		if ( next === mode ) {
			return;
		}
		setToolbar( null );
		// The visual editor must re-render from `value` when it comes
		// back, since Code mode may have changed it.
		lastEmitted.current = null;
		setMode( next );
	};

	// Floating toolbar: follows the text selection while it is inside the
	// visual editor.
	useEffect( () => {
		if ( 'visual' !== mode ) {
			return;
		}

		const update = () => {
			const editable = editableRef.current;
			const stage = stageRef.current;
			const selection =
				editable?.ownerDocument.defaultView?.getSelection() ?? null;

			if (
				! editable ||
				! stage ||
				! selection ||
				selection.rangeCount === 0 ||
				selection.isCollapsed ||
				! editable.contains( selection.anchorNode ) ||
				! editable.contains( selection.focusNode )
			) {
				setToolbar( null );
				return;
			}

			const rect = selection.getRangeAt( 0 ).getBoundingClientRect();
			const stageRect = stage.getBoundingClientRect();
			const active: Record< string, boolean > = {};
			for ( const action of formatActions ) {
				active[ action.id ] = document.queryCommandState(
					action.command
				);
			}

			setToolbar( {
				top: rect.top - stageRect.top,
				left: Math.max(
					60,
					Math.min(
						rect.left + rect.width / 2 - stageRect.left,
						stageRect.width - 60
					)
				),
				active,
			} );
		};

		document.addEventListener( 'selectionchange', update );
		return () => document.removeEventListener( 'selectionchange', update );
	}, [ mode, formatActions ] );

	const applyFormat = ( action: FormatAction ) => {
		editableRef.current?.focus();
		document.execCommand( action.command );
		emitFromEditable();
	};

	const insertTag = ( tag: string ) => {
		const insertion = `{{${ tag }}}`;

		if ( 'code' === mode ) {
			const textarea = textareaRef.current;
			if ( ! textarea ) {
				return;
			}
			const start = textarea.selectionStart ?? value.length;
			const end = textarea.selectionEnd ?? value.length;
			onChange(
				value.slice( 0, start ) + insertion + value.slice( end )
			);
			// Restore focus + caret once React has re-rendered the textarea.
			requestAnimationFrame( () => {
				textarea.focus();
				const caret = start + insertion.length;
				textarea.setSelectionRange( caret, caret );
			} );
			return;
		}

		const editable = editableRef.current;
		if ( ! editable ) {
			return;
		}
		const selection = editable.ownerDocument.defaultView?.getSelection();
		// No caret in the editor yet: insert at the end.
		if ( ! selection || ! editable.contains( selection.anchorNode ) ) {
			editable.focus();
			const range = document.createRange();
			range.selectNodeContents( editable );
			range.collapse( false );
			selection?.removeAllRanges();
			selection?.addRange( range );
		}
		document.execCommand( 'insertText', false, insertion );
		emitFromEditable();
	};

	const handlePaste = ( event: React.ClipboardEvent ) => {
		// Plain text only: pasted rich text drags in foreign styles and
		// markup that don't belong in an email template.
		event.preventDefault();
		document.execCommand(
			'insertText',
			false,
			event.clipboardData.getData( 'text/plain' )
		);
	};

	const labelId = `merodiet-email-body-label-${ id }`;

	return (
		<div className={ styles.editor }>
			<div className={ styles.header }>
				<span id={ labelId } className={ styles.label }>
					{ __( 'Body', 'merodiet' ) }
				</span>
				<div
					className={ styles.modeSwitch }
					role="group"
					aria-label={ __( 'Editor mode', 'merodiet' ) }
				>
					{ ( [ 'visual', 'code' ] as Mode[] ).map( ( option ) => (
						<button
							key={ option }
							type="button"
							className={ `${ styles.modeButton } ${
								mode === option ? styles.modeActive : ''
							}` }
							aria-pressed={ mode === option }
							onClick={ () => switchMode( option ) }
						>
							{ 'visual' === option
								? __( 'Visual', 'merodiet' )
								: __( 'Code', 'merodiet' ) }
						</button>
					) ) }
				</div>
			</div>

			{ 'visual' === mode ? (
				<div className={ styles.stage } ref={ stageRef }>
					{ toolbar && (
						<div
							className={ styles.toolbar }
							style={ {
								top: toolbar.top,
								left: toolbar.left,
							} }
							role="toolbar"
							aria-label={ __( 'Text formatting', 'merodiet' ) }
							// Keep the text selection when clicking a button.
							onMouseDown={ ( event ) => event.preventDefault() }
						>
							{ formatActions.map( ( action ) => (
								<button
									key={ action.id }
									type="button"
									className={ `${ styles.toolbarButton } ${
										toolbar.active[ action.id ]
											? styles.toolbarActive
											: ''
									}` }
									aria-label={ action.label }
									aria-pressed={
										toolbar.active[ action.id ] ?? false
									}
									onClick={ () => applyFormat( action ) }
								>
									<span className={ action.glyphClassName }>
										{ action.glyph }
									</span>
								</button>
							) ) }
						</div>
					) }
					<div className={ styles.email }>
						<div className={ styles.emailHeader }>
							{ logoUrl && (
								<img
									src={ logoUrl }
									alt=""
									className={ styles.emailLogo }
								/>
							) }
							<span>{ siteName }</span>
						</div>
						<div
							ref={ editableRef }
							className={ styles.emailBody }
							contentEditable
							suppressContentEditableWarning
							role="textbox"
							aria-multiline="true"
							aria-labelledby={ labelId }
							spellCheck
							onInput={ emitFromEditable }
							onPaste={ handlePaste }
						/>
						<div className={ styles.emailFooter }>
							{ sprintf(
								/* translators: %s: the site's name */
								__(
									"Sent by %s. If you weren't expecting this email, you can safely ignore it.",
									'merodiet'
								),
								siteName
							) }
						</div>
					</div>
				</div>
			) : (
				<textarea
					id={ `merodiet-email-body-${ id }` }
					ref={ textareaRef }
					className={ styles.code }
					rows={ 10 }
					value={ value }
					aria-labelledby={ labelId }
					spellCheck={ false }
					onChange={ ( event ) => onChange( event.target.value ) }
				/>
			) }

			<div className={ styles.tagRow }>
				{ Object.entries( tags ).map( ( [ tag, description ] ) => (
					<button
						key={ tag }
						type="button"
						className={ styles.tagButton }
						title={ description }
						// Keep the caret/selection in the editor.
						onMouseDown={ ( event ) => event.preventDefault() }
						onClick={ () => insertTag( tag ) }
					>
						{ `{{${ tag }}}` }
					</button>
				) ) }
			</div>
		</div>
	);
}
