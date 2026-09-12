import type { ReactNode } from 'react';
import styles from './Panel.module.css';

export default function Panel( { children, className = '' }: { children: ReactNode; className?: string } ) {
	return <div className={ `${ styles.panel } ${ className }`.trim() }>{ children }</div>;
}

export function PanelHead( { children }: { children: ReactNode } ) {
	return <div className={ styles.panelHead }>{ children }</div>;
}

export function PanelBody( { children, className = '' }: { children: ReactNode; className?: string } ) {
	return <div className={ `${ styles.panelBody } ${ className }`.trim() }>{ children }</div>;
}
