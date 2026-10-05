import { __ } from '@wordpress/i18n';
import type { ReactNode } from 'react';
import styles from './Drawer.module.css';

interface DrawerProps {
	isOpen: boolean;
	title: string;
	onClose: () => void;
	/** Return (or resolve to) false to block closing (e.g. unsaved changes) — checked before the X button and backdrop click. */
	confirmClose?: () => boolean | Promise< boolean >;
	footer?: ReactNode;
	children: ReactNode;
}

export default function Drawer( {
	isOpen,
	title,
	onClose,
	confirmClose,
	footer,
	children,
}: DrawerProps ) {
	const handleClose = async () => {
		if ( ! confirmClose || ( await confirmClose() ) ) {
			onClose();
		}
	};

	return (
		<>
			<div
				className={ `${ styles.scrim } ${
					isOpen ? styles.isOpen : ''
				}`.trim() }
				role="button"
				tabIndex={ -1 }
				aria-label={ __( 'Close', 'merodiet' ) }
				onClick={ handleClose }
				onKeyDown={ ( event ) => {
					if ( 'Escape' === event.key || 'Enter' === event.key ) {
						handleClose();
					}
				} }
			/>
			<aside
				className={ `${ styles.drawer } ${
					isOpen ? styles.isOpen : ''
				}`.trim() }
			>
				<div className={ styles.drawerHead }>
					<h3>{ title }</h3>
					<button
						className={ styles.drawerClose }
						onClick={ handleClose }
						aria-label={ __( 'Close', 'merodiet' ) }
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<path d="M18 6 6 18M6 6l12 12" />
						</svg>
					</button>
				</div>
				<div className={ styles.drawerBody }>{ children }</div>
				{ footer && (
					<div className={ styles.drawerFoot }>{ footer }</div>
				) }
			</aside>
		</>
	);
}
