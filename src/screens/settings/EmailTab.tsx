import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import EmailSettingsTab from './EmailSettingsTab';
import styles from './Settings.module.css';

type EmailAudienceTab = 'practitioner' | 'client';

// Nested sub-tabs inside Settings' top-level "Email" tab — one
// EmailSettingsTab per audience, same pill-tab pattern as the parent.
export default function EmailTab() {
	const [ activeAudience, setActiveAudience ] = useState< EmailAudienceTab >(
		'practitioner'
	);

	return (
		<>
			<div className={ styles.subTabs }>
				<button
					className={ `${ styles.tab } ${
						'practitioner' === activeAudience ? styles.isActive : ''
					}` }
					onClick={ () => setActiveAudience( 'practitioner' ) }
				>
					{ __( 'Practitioner', 'nutrio' ) }
				</button>
				<button
					className={ `${ styles.tab } ${
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
