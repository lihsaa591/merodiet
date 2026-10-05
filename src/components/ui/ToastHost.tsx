import { useCallback, useEffect, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { registerToastHost } from '../../utils/toast';
import type { ToastItem, ToastKind } from '../../utils/toast';
import styles from './ToastHost.module.css';

// Errors stay longer: they usually explain something to act on.
const DURATION_MS: Record< ToastKind, number > = {
	success: 3000,
	info: 4000,
	error: 6000,
};

const MAX_VISIBLE = 4;

function ToastIcon( { kind }: { kind: ToastKind } ) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.5"
			aria-hidden="true"
		>
			{ 'success' === kind && <path d="M5 13l4 4L19 7" /> }
			{ 'error' === kind && (
				<>
					<circle cx="12" cy="12" r="9" />
					<path d="M12 8v5M12 16.5v.01" />
				</>
			) }
			{ 'info' === kind && (
				<>
					<circle cx="12" cy="12" r="9" />
					<path d="M12 11v5M12 7.5v.01" />
				</>
			) }
		</svg>
	);
}

// Mounted once at the app root — the single surface every toast.*() call
// renders into, so success/error notices look and behave the same on every
// screen.
export default function ToastHost() {
	const [ toasts, setToasts ] = useState< ToastItem[] >( [] );
	// Mirrors `toasts` so the registered listener (created once) always sees
	// the current list without being re-registered on every change.
	const toastsRef = useRef< ToastItem[] >( [] );
	const nextId = useRef( 1 );
	const timers = useRef< Map< number, ReturnType< typeof setTimeout > > >(
		new Map()
	);

	const update = useCallback( ( next: ToastItem[] ) => {
		toastsRef.current = next;
		setToasts( next );
	}, [] );

	const dismiss = useCallback(
		( id: number ) => {
			const timer = timers.current.get( id );
			if ( timer ) {
				clearTimeout( timer );
				timers.current.delete( id );
			}
			update( toastsRef.current.filter( ( t ) => t.id !== id ) );
		},
		[ update ]
	);

	useEffect( () => {
		const activeTimers = timers.current;

		registerToastHost( ( { kind, message } ) => {
			// A repeat of a toast that's already showing (e.g. a time input
			// firing change events as you type) restarts its timer instead
			// of stacking duplicates.
			const existing = toastsRef.current.find(
				( t ) => t.kind === kind && t.message === message
			);
			const id = existing ? existing.id : nextId.current++;

			const previousTimer = activeTimers.get( id );
			if ( previousTimer ) {
				clearTimeout( previousTimer );
			}
			activeTimers.set(
				id,
				setTimeout( () => dismiss( id ), DURATION_MS[ kind ] )
			);

			if ( ! existing ) {
				update(
					[ ...toastsRef.current, { id, kind, message } ].slice(
						-MAX_VISIBLE
					)
				);
			}
		} );

		return () => {
			registerToastHost( null );
			activeTimers.forEach( clearTimeout );
			activeTimers.clear();
		};
	}, [ dismiss, update ] );

	if ( 0 === toasts.length ) {
		return null;
	}

	return (
		<div className={ styles.region }>
			{ toasts.map( ( item ) => (
				<div
					key={ item.id }
					className={ `${ styles.toast } ${ styles[ item.kind ] }` }
					// Errors interrupt screen readers; the rest are polite.
					role={ 'error' === item.kind ? 'alert' : 'status' }
				>
					<ToastIcon kind={ item.kind } />
					<span className={ styles.message }>{ item.message }</span>
					<button
						type="button"
						className={ styles.close }
						aria-label={ __( 'Dismiss', 'merodiet' ) }
						onClick={ () => dismiss( item.id ) }
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							aria-hidden="true"
						>
							<path d="M6 6l12 12M18 6L6 18" />
						</svg>
					</button>
				</div>
			) ) }
		</div>
	);
}
