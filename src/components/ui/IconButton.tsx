import type { ReactNode } from 'react';
import styles from './IconButton.module.css';

interface IconButtonProps {
	label: string;
	onClick: () => void;
	children: ReactNode;
}

export default function IconButton( {
	label,
	onClick,
	children,
}: IconButtonProps ) {
	return (
		<button
			className={ styles.iconBtn }
			onClick={ onClick }
			aria-label={ label }
			title={ label }
		>
			{ children }
		</button>
	);
}
