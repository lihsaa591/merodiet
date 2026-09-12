import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

const VARIANT_CLASS = {
	primary: styles.btnPrimary,
	ghost: styles.btnGhost,
	link: styles.btnLink,
};

interface ButtonProps extends ButtonHTMLAttributes< HTMLButtonElement > {
	variant?: keyof typeof VARIANT_CLASS;
	destructive?: boolean;
	pro?: boolean;
	children?: ReactNode;
}

export default function Button( {
	variant = 'primary',
	destructive = false,
	pro = false,
	className = '',
	children,
	...rest
}: ButtonProps ) {
	const classes = [
		styles.btn,
		VARIANT_CLASS[ variant ] ?? VARIANT_CLASS.primary,
		destructive ? styles.isDestructive : '',
		pro ? styles.btnPro : '',
		className,
	]
		.filter( Boolean )
		.join( ' ' );

	return (
		<button className={ classes } { ...rest }>
			{ children }
			{ pro && <ProLockIcon /> }
		</button>
	);
}

// Shared across Button and the sidebar's Pro nav item -- stays a plain
// global class (see base.css) rather than a scoped module, since it's not
// owned by one component.
function ProLockIcon() {
	return (
		<svg className="nutrio-pro-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<rect x="5" y="11" width="14" height="9" rx="2" fill="currentColor" stroke="none" />
			<path d="M8 11V8a4 4 0 0 1 8 0v3" />
		</svg>
	);
}
