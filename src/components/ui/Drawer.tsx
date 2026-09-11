import { __ } from '@wordpress/i18n';
import type { ReactNode } from 'react';

interface DrawerProps {
	isOpen: boolean;
	title: string;
	onClose: () => void;
	footer?: ReactNode;
	children: ReactNode;
}

export default function Drawer( { isOpen, title, onClose, footer, children }: DrawerProps ) {
	return (
		<>
			<div
				className={ `nutrio-scrim ${ isOpen ? 'is-open' : '' }`.trim() }
				onClick={ onClose }
			/>
			<aside className={ `nutrio-drawer ${ isOpen ? 'is-open' : '' }`.trim() }>
				<div className="nutrio-drawer-head">
					<h3>{ title }</h3>
					<button className="nutrio-drawer-close" onClick={ onClose } aria-label={ __( 'Close', 'nutrio' ) }>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<path d="M18 6 6 18M6 6l12 12" />
						</svg>
					</button>
				</div>
				<div className="nutrio-drawer-body">{ children }</div>
				{ footer && <div className="nutrio-drawer-foot">{ footer }</div> }
			</aside>
		</>
	);
}
