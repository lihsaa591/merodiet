import type { ButtonHTMLAttributes, ReactNode } from 'react';

const VARIANT_CLASS = {
	primary: 'nutrio-btn-primary',
	ghost: 'nutrio-btn-ghost',
	link: 'nutrio-btn-link',
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
		'nutrio-btn',
		VARIANT_CLASS[ variant ] ?? VARIANT_CLASS.primary,
		destructive ? 'is-destructive' : '',
		pro ? 'nutrio-btn-pro' : '',
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

function ProLockIcon() {
	return (
		<svg className="nutrio-pro-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<rect x="5" y="11" width="14" height="9" rx="2" fill="currentColor" stroke="none" />
			<path d="M8 11V8a4 4 0 0 1 8 0v3" />
		</svg>
	);
}
