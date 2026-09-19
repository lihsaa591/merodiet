import styles from './Avatar.module.css';

// Client-identity marker — a colored circle with initials. Deliberately kept
// (not the left-border-strip alternative a design review proposed) — see the
// "SUPERSEDED, reverted" note in DESIGN.md.
const PALETTE = [ 'var(--sage)', 'var(--clay)', '#7b9fae', '#9c8f6e' ];

/**
 * Deterministic color pick so the same client always gets the same color.
 * @param id
 */
function colorForId( id: number ): string {
	const index = Math.abs( id || 0 ) % PALETTE.length;
	return PALETTE[ index ];
}

function initialsFor( firstName?: string, lastName?: string ): string {
	return `${ firstName?.[ 0 ] ?? '' }${
		lastName?.[ 0 ] ?? ''
	}`.toUpperCase();
}

interface AvatarProps {
	id: number;
	firstName?: string;
	lastName?: string;
	size?: 'sm' | 'md' | 'lg';
}

export default function Avatar( {
	id,
	firstName,
	lastName,
	size = 'md',
}: AvatarProps ) {
	const SIZE_CLASSES: Record<
		NonNullable< AvatarProps[ 'size' ] >,
		string
	> = {
		sm: styles.sm,
		md: '',
		lg: styles.lg,
	};
	const sizeClass = SIZE_CLASSES[ size ];

	return (
		<div
			className={ `${ styles.avatar } ${ sizeClass }`.trim() }
			style={ { background: colorForId( id ) } }
		>
			{ initialsFor( firstName, lastName ) }
		</div>
	);
}
