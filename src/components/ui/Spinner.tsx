import { __ } from '@wordpress/i18n';
import styles from './Spinner.module.css';

interface SpinnerProps {
	size?: 'sm' | 'md' | 'lg';
	/** Screen-reader label — defaults to "Loading…". */
	label?: string;
	className?: string;
}

// A circular indeterminate spinner — for a button's own busy state, or
// any small inline "this is working" indicator. For a whole screen or
// section that's still loading its content, prefer Skeleton instead:
// it previews the coming layout rather than making the viewer wait on
// a blank spot.
export default function Spinner( {
	size = 'md',
	label,
	className = '',
}: SpinnerProps ) {
	const SIZE_CLASSES: Record<
		NonNullable< SpinnerProps[ 'size' ] >,
		string
	> = {
		sm: styles.sm,
		md: '',
		lg: styles.lg,
	};

	return (
		<span
			className={ `${ styles.spinner } ${ SIZE_CLASSES[ size ] } ${ className }`.trim() }
			role="status"
		>
			<span className={ styles.visuallyHidden }>
				{ label ?? __( 'Loading…', 'merodiet' ) }
			</span>
		</span>
	);
}
