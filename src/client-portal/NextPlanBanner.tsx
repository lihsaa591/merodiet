import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import { formatShortDate } from '../utils/date';
import type { NextPlanSummary } from '../types';
import styles from './NextPlanBanner.module.css';

// Self-contained (fetches its own data) so it can be dropped into any
// screen — the Plan tab, the Dashboard tab — without prop drilling.
// Renders nothing until there's actually a next plan to preview.
export default function NextPlanBanner() {
	const [ nextPlan, setNextPlan ] = useState< NextPlanSummary | null >(
		null
	);

	useEffect( () => {
		apiFetch< NextPlanSummary | null >( {
			path: '/nutrio/v1/me/plan/next',
		} )
			.then( setNextPlan )
			.catch( () => {} );
	}, [] );

	if ( ! nextPlan ) {
		return null;
	}

	return (
		<div className={ styles.nextPlanBanner }>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.8"
			>
				<rect x="3.5" y="4" width="17" height="16" rx="2" />
				<path d="M3.5 9h17M8 3v3M16 3v3" />
			</svg>
			<span>
				{ __( 'Next up:', 'nutrio' ) }{ ' ' }
				<strong>{ nextPlan.title }</strong> { __( 'starts', 'nutrio' ) }{ ' ' }
				{ formatShortDate( nextPlan.start_date ) }
			</span>
		</div>
	);
}
