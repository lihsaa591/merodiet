import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import EmailSenderSettings from './EmailSenderSettings';
import EmailSettingsTab from './EmailSettingsTab';
import styles from './Settings.module.css';

type EmailAudienceTab = 'practitioner' | 'client';

// The sender (From name/address, plus Pro styling) is one site-wide
// setting for every email, so it sits above the audience sub-tabs.
//
// Nested sub-tabs inside Settings' top-level "Email" tab — a
// segmented-control style (not the parent's pill-tab style) so the
// hierarchy is visually obvious: this is a filter within Email, not a
// sibling of General/Email.
export default function EmailTab() {
	const [ activeAudience, setActiveAudience ] =
		useState< EmailAudienceTab >( 'practitioner' );

	return (
		<>
			<EmailSenderSettings />

			<div className={ styles.subTabsWrap }>
				<button
					className={ `${ styles.subTab } ${
						'practitioner' === activeAudience ? styles.isActive : ''
					}` }
					onClick={ () => setActiveAudience( 'practitioner' ) }
				>
					{ __( 'Practitioner', 'nutrio' ) }
				</button>
				<button
					className={ `${ styles.subTab } ${
						'client' === activeAudience ? styles.isActive : ''
					}` }
					onClick={ () => setActiveAudience( 'client' ) }
				>
					{ __( 'Client', 'nutrio' ) }
				</button>
			</div>

			<EmailSettingsTab audience={ activeAudience } />
		</>
	);
}
