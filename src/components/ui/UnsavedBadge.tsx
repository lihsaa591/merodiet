import { __ } from '@wordpress/i18n';
import styles from './UnsavedBadge.module.css';

export default function UnsavedBadge() {
	return (
		<span className={ styles.badge }>
			{ __( 'Unsaved changes', 'nutrio' ) }
		</span>
	);
}
