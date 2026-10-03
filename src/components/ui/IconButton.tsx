import type { ReactNode } from 'react';
import Tooltip from './Tooltip';
import styles from './IconButton.module.css';

interface IconButtonProps {
	label: string;
	onClick: () => void;
	children: ReactNode;
	disabled?: boolean;
}

export default function IconButton( {
	label,
	onClick,
	children,
	disabled,
}: IconButtonProps ) {
	return (
		<Tooltip content={ label }>
			<button
				className={ styles.iconBtn }
				onClick={ onClick }
				aria-label={ label }
				disabled={ disabled }
			>
				{ children }
			</button>
		</Tooltip>
	);
}
