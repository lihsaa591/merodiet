import type { ReactNode } from 'react';

interface IconButtonProps {
	label: string;
	onClick: () => void;
	children: ReactNode;
}

export default function IconButton( { label, onClick, children }: IconButtonProps ) {
	return (
		<button className="nutrio-icon-btn" onClick={ onClick } aria-label={ label } title={ label }>
			{ children }
		</button>
	);
}
