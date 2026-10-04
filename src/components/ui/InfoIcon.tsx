import styles from './InfoIcon.module.css';

interface InfoIconProps {
	label: string;
}

// A bare info glyph meant to sit inside a Tooltip wrapper — the label is
// for screen readers only (the Tooltip's bubble carries the visible copy).
export default function InfoIcon( { label }: InfoIconProps ) {
	return (
		<span className={ styles.infoIcon } tabIndex={ 0 } aria-label={ label }>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
			>
				<circle cx="12" cy="12" r="9" />
				<path d="M12 11v5M12 8h.01" strokeLinecap="round" />
			</svg>
		</span>
	);
}
