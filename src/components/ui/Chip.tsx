import type { ReactNode } from 'react';

type Tone = 'sage' | 'clay' | 'success' | 'warning' | 'critical';

// The one status-communication primitive — see DESIGN.md. Never introduce a
// second status idiom; every state (client, plan, food source) uses this.
export default function Chip( { tone = 'sage', children }: { tone?: Tone; children: ReactNode } ) {
	return <span className={ `nutrio-chip nutrio-chip-${ tone }` }>{ children }</span>;
}
