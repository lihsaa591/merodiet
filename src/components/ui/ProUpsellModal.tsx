import { __, sprintf } from '@wordpress/i18n';
import Button from './Button';
import styles from './ProUpsellModal.module.css';

interface ProUpsellModalProps {
	isOpen: boolean;
	featureName: string;
	onClose: () => void;
}

// The one shared Pro upsell surface — every locked feature opens this same
// modal rather than rolling its own. See DESIGN.md's Pro-feature pattern.
export default function ProUpsellModal( { isOpen, featureName, onClose }: ProUpsellModalProps ) {
	if ( ! isOpen ) {
		return null;
	}

	return (
		<div
			className={ styles.modalScrim }
			onClick={ ( e ) => e.target === e.currentTarget && onClose() }
		>
			<div className={ styles.modal }>
				<div className={ styles.modalIcon }>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<rect x="5" y="11" width="14" height="9" rx="2" />
						<path d="M8 11V8a4 4 0 0 1 8 0v3" />
					</svg>
				</div>
				<h3>{ __( 'This is a Pro feature', 'nutrio' ) }</h3>
				<p>
					{ sprintf(
						/* translators: %s: the locked feature's name */
						__( '%s is part of Nutrio Pro. Upgrade to unlock it for your practice.', 'nutrio' ),
						featureName
					) }
				</p>
				<div className={ styles.modalActions }>
					<Button variant="primary" style={ { justifyContent: 'center' } }>
						{ __( 'Upgrade to Pro', 'nutrio' ) }
					</Button>
					<Button variant="ghost" style={ { justifyContent: 'center' } } onClick={ onClose }>
						{ __( 'Maybe later', 'nutrio' ) }
					</Button>
				</div>
			</div>
		</div>
	);
}
