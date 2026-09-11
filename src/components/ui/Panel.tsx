import type { ReactNode } from 'react';

export default function Panel( { children, className = '' }: { children: ReactNode; className?: string } ) {
	return <div className={ `nutrio-panel ${ className }`.trim() }>{ children }</div>;
}

export function PanelHead( { children }: { children: ReactNode } ) {
	return <div className="nutrio-panel-head">{ children }</div>;
}

export function PanelBody( { children, className = '' }: { children: ReactNode; className?: string } ) {
	return <div className={ `nutrio-panel-body ${ className }`.trim() }>{ children }</div>;
}
