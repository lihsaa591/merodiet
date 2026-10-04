import type { ReactNode } from 'react';
import styles from './Tooltip.module.css';

interface TooltipProps {
	content: string;
	children: ReactNode;
	position?: 'top' | 'bottom';
}

// Pure-CSS tooltip (:hover/:focus-within in Tooltip.module.css) — no JS
// positioning needed since every current trigger is a small, fixed-size
// icon. Shared between the admin app and the client portal (both import
// from src/components/ui), so one implementation covers both.
export default function Tooltip( {
	content,
	children,
	position = 'top',
}: TooltipProps ) {
	return (
		<span
			className={ `${ styles.wrapper } ${
				position === 'bottom' ? styles.arrowBottom : styles.arrowTop
			}` }
		>
			{ children }
			<span
				className={ `${ styles.bubble } ${
					position === 'bottom' ? styles.bottom : styles.top
				}` }
				role="tooltip"
			>
				{ content }
			</span>
		</span>
	);
}
