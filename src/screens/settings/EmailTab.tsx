import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import EmailSettingsTab from './EmailSettingsTab';
import styles from './Settings.module.css';

type EmailAudienceTab = 'practitioner' | 'client';

// Nested sub-tabs inside Settings' top-level "Email" tab — a
// segmented-control style (not the parent's pill-tab style) so the
// hierarchy is visually obvious: this is a filter within Email, not a
// sibling of General/Email.
export default function EmailTab() {
	const [ activeAudience, setActiveAudience ] = useState< EmailAudienceTab >(
		'practitioner'
	);

	return (
		<>
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
