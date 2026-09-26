import styles from './Skeleton.module.css';

interface SkeletonProps {
	/** Any CSS width value — defaults to 100% (fills its container). */
	width?: string;
	/** Any CSS height value — defaults to a text-line height. */
	height?: string;
	/** 'text' rounds like a line of text; 'circle' makes width/height equal and fully round (for an avatar placeholder). */
	shape?: 'text' | 'block' | 'circle';
	className?: string;
}

// A single shimmering placeholder block — the building block every
// screen's skeleton is composed from. Kept content-agnostic (just a
// sized, shimmering rectangle) so any screen can assemble a skeleton
// that roughly matches its own final layout.
export default function Skeleton( {
	width = '100%',
	height = '14px',
	shape = 'text',
	className = '',
}: SkeletonProps ) {
	return (
		<span
			className={ `${ styles.skeleton } ${ styles[ shape ] } ${ className }`.trim() }
			style={ { width, height } }
			aria-hidden="true"
		/>
	);
}
