import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import { doAction } from '@wordpress/hooks';
import Button from '../components/ui/Button';
import type { LogEntry, LogEntryInput, Plan, PlanItem } from '../types';
import styles from './LogTab.module.css';

type Status = 'eaten' | 'substituted' | 'skipped';

// The plan's day_offset that corresponds to today, based on its start_date.
function todaysDayOffset( startDate: string ): number {
	const start = new Date( startDate + 'T00:00:00' );
	const today = new Date();
	today.setHours( 0, 0, 0, 0 );
	const diffMs = today.getTime() - start.getTime();
	return Math.floor( diffMs / ( 1000 * 60 * 60 * 24 ) );
}

export default function LogTab() {
	const [ plan, setPlan ] = useState< Plan | null | undefined >( undefined );
	const [ notes, setNotes ] = useState( '' );
	const [ isSubmittingAdHoc, setIsSubmittingAdHoc ] = useState( false );
	const [ pendingItemId, setPendingItemId ] = useState< number | null >(
		null
	);
	const [ errorMessage, setErrorMessage ] = useState< string | null >( null );

	useEffect( () => {
		apiFetch< Plan | null >( { path: '/nutrio/v1/me/plan' } ).then(
			setPlan,
			() => setPlan( null )
		);
	}, [] );

	const today = new Date().toISOString().slice( 0, 10 );

	const logPlanItem = async ( item: PlanItem, status: Status ) => {
		setPendingItemId( item.id );

		const payload: LogEntryInput = {
			plan_item_id: item.id,
			food_id: item.food_id ?? undefined,
			recipe_id: item.recipe_id ?? undefined,
			quantity_grams: item.quantity_grams ?? undefined,
			servings: item.servings ?? undefined,
			log_date: today,
			status,
		};

		try {
			const entry = await apiFetch< LogEntry >( {
				path: '/nutrio/v1/me/logs',
				method: 'POST',
				data: payload,
			} );
			doAction( 'nutrio.clientPortal.logCreated', entry );
			setErrorMessage( null );
		} catch {
			setErrorMessage(
				__( 'Something went wrong — please try again.', 'nutrio' )
			);
		} finally {
			setPendingItemId( null );
		}
	};

	const logAdHoc = async ( event: React.FormEvent ) => {
		event.preventDefault();
		setIsSubmittingAdHoc( true );

		try {
			const entry = await apiFetch< LogEntry >( {
				path: '/nutrio/v1/me/logs',
				method: 'POST',
				data: {
					log_date: today,
					status: 'eaten',
					notes,
				} as LogEntryInput,
			} );
			doAction( 'nutrio.clientPortal.logCreated', entry );
			setNotes( '' );
			setErrorMessage( null );
		} catch {
			setErrorMessage(
				__( 'Something went wrong — please try again.', 'nutrio' )
			);
		} finally {
			setIsSubmittingAdHoc( false );
		}
	};

	const todaysItems: PlanItem[] =
		undefined !== plan && null !== plan
			? plan.days.find(
					( day ) =>
						day.day_offset === todaysDayOffset( plan.start_date )
			  )?.items ?? []
			: [];

	return (
		<div>
			{ errorMessage && (
				<p className={ styles.error }>{ errorMessage }</p>
			) }

			{ undefined === plan && <p>{ __( 'Loading…', 'nutrio' ) }</p> }

			{ null === plan && (
				<p className={ styles.empty }>
					{ __(
						'No plan assigned yet — check back once your practitioner assigns one.',
						'nutrio'
					) }
				</p>
			) }

			{ plan && todaysItems.length > 0 && (
				<ul className={ styles.itemList }>
					{ todaysItems.map( ( item ) => (
						<li key={ item.id } className={ styles.item }>
							<span>
								{ item.food_description ??
									item.recipe_name ??
									__( 'Item', 'nutrio' ) }
							</span>
							<div className={ styles.actions }>
								<Button
									variant="ghost"
									disabled={ pendingItemId === item.id }
									onClick={ () =>
										logPlanItem( item, 'eaten' )
									}
								>
									{ __( 'Mark eaten', 'nutrio' ) }
								</Button>
								<Button
									variant="ghost"
									disabled={ pendingItemId === item.id }
									onClick={ () =>
										logPlanItem( item, 'substituted' )
									}
								>
									{ __( 'Substituted', 'nutrio' ) }
								</Button>
								<Button
									variant="ghost"
									disabled={ pendingItemId === item.id }
									onClick={ () =>
										logPlanItem( item, 'skipped' )
									}
								>
									{ __( 'Skip', 'nutrio' ) }
								</Button>
							</div>
						</li>
					) ) }
				</ul>
			) }

			<form onSubmit={ logAdHoc } className={ styles.adHocForm }>
				<label htmlFor="nutrio-log-notes">
					{ __( 'Log something else', 'nutrio' ) }
				</label>
				<textarea
					id="nutrio-log-notes"
					value={ notes }
					onChange={ ( event ) => setNotes( event.target.value ) }
					placeholder={ __( 'What did you eat?', 'nutrio' ) }
					required
				/>
				<Button
					type="submit"
					variant="primary"
					disabled={ isSubmittingAdHoc }
				>
					{ __( 'Log it', 'nutrio' ) }
				</Button>
			</form>
		</div>
	);
}
