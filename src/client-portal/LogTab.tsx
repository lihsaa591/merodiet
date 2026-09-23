import { useEffect, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import { doAction } from '@wordpress/hooks';
import Button from '../components/ui/Button';
import Panel, { PanelBody } from '../components/ui/Panel';
import {
	MEAL_ORDER,
	MEAL_LABELS,
	MEAL_ICONS,
	itemsByMeal,
	itemQuantityLabel,
} from './mealMeta';
import { formatDate } from '../utils/date';
import type { LogEntry, LogEntryInput, Plan, PlanItem } from '../types';
import styles from './LogTab.module.css';

type Status = 'eaten' | 'substituted' | 'skipped';

const STATUS_LABELS: Record< Status, string > = {
	eaten: __( 'Eaten', 'nutrio' ),
	substituted: __( 'Substituted', 'nutrio' ),
	skipped: __( 'Skipped', 'nutrio' ),
};

// How many days back the "Recent history" section looks, including today.
const HISTORY_DAYS = 7;

// The plan's day_offset that corresponds to today, based on its start_date.
function todaysDayOffset( startDate: string ): number {
	const start = new Date( startDate + 'T00:00:00' );
	const today = new Date();
	today.setHours( 0, 0, 0, 0 );
	const diffMs = today.getTime() - start.getTime();
	return Math.floor( diffMs / ( 1000 * 60 * 60 * 24 ) );
}

function daysAgo( days: number ): string {
	const date = new Date();
	date.setDate( date.getDate() - days );
	return date.toISOString().slice( 0, 10 );
}

// A lookup of every item across every day of the plan (not just today's),
// so a history entry logged on any past date can still resolve its label.
function itemLabelsById(
	plan: Plan | null | undefined
): Record< number, string > {
	const labels: Record< number, string > = {};

	if ( ! plan ) {
		return labels;
	}

	for ( const day of plan.days ) {
		for ( const item of day.items ) {
			labels[ item.id ] =
				item.food_description ??
				item.recipe_name ??
				__( 'Item', 'nutrio' );
		}
	}

	return labels;
}

// A history entry's display label — the plan item it was logged against,
// or (for an ad-hoc "log something else" entry, which has no plan_item_id)
// its own free-text notes, since that free text IS the food description.
function entryLabel(
	entry: LogEntry,
	itemLabels: Record< number, string >
): string {
	if ( null !== entry.plan_item_id && itemLabels[ entry.plan_item_id ] ) {
		return itemLabels[ entry.plan_item_id ];
	}

	return entry.notes ?? __( 'Logged item', 'nutrio' );
}

interface LoggedItem {
	status: Status;
	notes: string | null;
}

export default function LogTab() {
	const [ plan, setPlan ] = useState< Plan | null | undefined >( undefined );
	const [ loggedByItem, setLoggedByItem ] = useState<
		Record< number, LoggedItem >
	>( {} );
	const [ notes, setNotes ] = useState( '' );
	const [ isSubmittingAdHoc, setIsSubmittingAdHoc ] = useState( false );
	const [ pendingItemId, setPendingItemId ] = useState< number | null >(
		null
	);
	const [ errorMessage, setErrorMessage ] = useState< string | null >( null );
	const [ successMessage, setSuccessMessage ] = useState< string | null >(
		null
	);
	const [ history, setHistory ] = useState< LogEntry[] | undefined >(
		undefined
	);
	const [ substitutingItemId, setSubstitutingItemId ] = useState<
		number | null
	>( null );
	const [ substituteNote, setSubstituteNote ] = useState( '' );

	const today = new Date().toISOString().slice( 0, 10 );

	const loadHistory = () => {
		apiFetch< LogEntry[] >( {
			path: `/nutrio/v1/me/logs?from=${ daysAgo(
				HISTORY_DAYS - 1
			) }&to=${ today }`,
		} ).then( setHistory, () => setHistory( [] ) );
	};

	useEffect( () => {
		apiFetch< Plan | null >( { path: '/nutrio/v1/me/plan' } ).then(
			setPlan,
			() => setPlan( null )
		);

		loadHistory();
		// eslint-disable-next-line react-hooks/exhaustive-deps -- `today` is stable for the component's lifetime; re-running on it would re-fetch pointlessly.
	}, [] );

	// Today's per-item logged status is derived from the same history fetch
	// (it already covers today) rather than a second, redundant request.
	useEffect( () => {
		if ( undefined === history ) {
			return;
		}

		const map: Record< number, LoggedItem > = {};
		for ( const entry of history ) {
			if ( entry.log_date === today && null !== entry.plan_item_id ) {
				map[ entry.plan_item_id ] = {
					status: entry.status,
					notes: entry.notes,
				};
			}
		}
		setLoggedByItem( map );
		// eslint-disable-next-line react-hooks/exhaustive-deps -- `today` is stable for the component's lifetime.
	}, [ history ] );

	// Self-dismissing success toast.
	useEffect( () => {
		if ( ! successMessage ) {
			return;
		}

		const timer = setTimeout( () => setSuccessMessage( null ), 2200 );
		return () => clearTimeout( timer );
	}, [ successMessage ] );

	const logPlanItem = async (
		item: PlanItem,
		status: Status,
		notesForEntry?: string
	) => {
		setPendingItemId( item.id );
		setErrorMessage( null );

		const payload: LogEntryInput = {
			plan_item_id: item.id,
			food_id: item.food_id ?? undefined,
			recipe_id: item.recipe_id ?? undefined,
			quantity_grams: item.quantity_grams ?? undefined,
			servings: item.servings ?? undefined,
			log_date: today,
			status,
			notes: notesForEntry || undefined,
		};

		try {
			const entry = await apiFetch< LogEntry >( {
				path: '/nutrio/v1/me/logs',
				method: 'POST',
				data: payload,
			} );
			doAction( 'nutrio.clientPortal.logCreated', entry );
			setLoggedByItem( ( prev ) => ( {
				...prev,
				[ item.id ]: {
					status,
					notes: notesForEntry || null,
				},
			} ) );
			setSuccessMessage( __( 'Logged.', 'nutrio' ) );
			loadHistory();
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
		setErrorMessage( null );

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
			setSuccessMessage( __( 'Logged.', 'nutrio' ) );
			loadHistory();
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

	const loggedCount = todaysItems.filter(
		( item ) => undefined !== loggedByItem[ item.id ]
	).length;
	const grouped = itemsByMeal( todaysItems );

	const itemLabels = itemLabelsById( plan );
	const historyByDate: Record< string, LogEntry[] > = {};
	for ( const entry of history ?? [] ) {
		if ( entry.log_date === today ) {
			continue; // Today's own detail is already shown above.
		}
		( historyByDate[ entry.log_date ] ??= [] ).push( entry );
	}
	const pastDates = Object.keys( historyByDate ).sort( ( a, b ) =>
		b.localeCompare( a )
	);

	return (
		<>
			<div className="nutrio-topbar">
				<h1>{ __( 'Log', 'nutrio' ) }</h1>
			</div>
			<Panel>
				<PanelBody>
					{ successMessage && (
						<div className={ styles.toast } role="status">
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
							>
								<path d="M5 13l4 4L19 7" />
							</svg>
							{ successMessage }
						</div>
					) }
					{ errorMessage && (
						<p className={ styles.error }>{ errorMessage }</p>
					) }

					{ undefined === plan && (
						<p>{ __( 'Loading…', 'nutrio' ) }</p>
					) }

					{ null === plan && (
						<p className={ styles.empty }>
							{ __(
								'No plan assigned yet — check back once your practitioner assigns one.',
								'nutrio'
							) }
						</p>
					) }

					{ plan && todaysItems.length > 0 && (
						<>
							<p className={ styles.progress }>
								{ sprintf(
									/* translators: 1: number of items logged so far today, 2: total items planned for today */
									__( '%1$d of %2$d logged today', 'nutrio' ),
									loggedCount,
									todaysItems.length
								) }
							</p>

							{ MEAL_ORDER.filter(
								( meal ) => ( grouped[ meal ] ?? [] ).length > 0
							).map( ( meal ) => (
								<div key={ meal } className={ styles.meal }>
									<h3 className={ styles.mealTitle }>
										<svg
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="1.8"
										>
											{ MEAL_ICONS[ meal ] }
										</svg>
										{ MEAL_LABELS[ meal ] }
									</h3>
									<ul className={ styles.itemList }>
										{ ( grouped[ meal ] ?? [] ).map(
											( item ) => {
												const logged =
													loggedByItem[ item.id ];
												const isSubstituting =
													substitutingItemId ===
													item.id;

												return (
													<li
														key={ item.id }
														className={
															styles.item
														}
													>
														<div
															className={
																styles.itemRow
															}
														>
															<div>
																<div
																	className={
																		styles.itemName
																	}
																>
																	{ item.food_description ??
																		item.recipe_name ??
																		__(
																			'Item',
																			'nutrio'
																		) }
																</div>
																{ itemQuantityLabel(
																	item
																) && (
																	<div
																		className={
																			styles.itemMeta
																		}
																	>
																		{ itemQuantityLabel(
																			item
																		) }
																	</div>
																) }
															</div>
															{ logged ? (
																<span
																	className={ `${
																		styles.statusPill
																	} ${
																		styles[
																			logged
																				.status
																		]
																	}` }
																>
																	{
																		STATUS_LABELS[
																			logged
																				.status
																		]
																	}
																</span>
															) : (
																! isSubstituting && (
																	<div
																		className={
																			styles.actions
																		}
																	>
																		<Button
																			variant="ghost"
																			disabled={
																				pendingItemId ===
																				item.id
																			}
																			onClick={ () =>
																				logPlanItem(
																					item,
																					'eaten'
																				)
																			}
																		>
																			{ __(
																				'Mark eaten',
																				'nutrio'
																			) }
																		</Button>
																		<Button
																			variant="ghost"
																			disabled={
																				pendingItemId ===
																				item.id
																			}
																			onClick={ () => {
																				setSubstitutingItemId(
																					item.id
																				);
																				setSubstituteNote(
																					''
																				);
																			} }
																		>
																			{ __(
																				'Substituted',
																				'nutrio'
																			) }
																		</Button>
																		<Button
																			variant="ghost"
																			disabled={
																				pendingItemId ===
																				item.id
																			}
																			onClick={ () =>
																				logPlanItem(
																					item,
																					'skipped'
																				)
																			}
																		>
																			{ __(
																				'Skip',
																				'nutrio'
																			) }
																		</Button>
																	</div>
																)
															) }
														</div>

														{ isSubstituting && (
															<div
																className={
																	styles.substituteForm
																}
															>
																<input
																	type="text"
																	value={
																		substituteNote
																	}
																	onChange={ (
																		event
																	) =>
																		setSubstituteNote(
																			event
																				.target
																				.value
																		)
																	}
																	placeholder={ __(
																		'What did you have instead?',
																		'nutrio'
																	) }
																/>
																<Button
																	variant="primary"
																	disabled={
																		pendingItemId ===
																		item.id
																	}
																	onClick={ async () => {
																		await logPlanItem(
																			item,
																			'substituted',
																			substituteNote
																		);
																		setSubstitutingItemId(
																			null
																		);
																	} }
																>
																	{ __(
																		'Save',
																		'nutrio'
																	) }
																</Button>
																<Button
																	variant="ghost"
																	onClick={ () =>
																		setSubstitutingItemId(
																			null
																		)
																	}
																>
																	{ __(
																		'Cancel',
																		'nutrio'
																	) }
																</Button>
															</div>
														) }

														{ logged?.notes && (
															<div
																className={
																	styles.itemNote
																}
															>
																{ logged.notes }
															</div>
														) }
													</li>
												);
											}
										) }
									</ul>
								</div>
							) ) }
						</>
					) }

					<form onSubmit={ logAdHoc } className={ styles.adHocForm }>
						<div className={ `nutrio-field ${ styles.field }` }>
							<label htmlFor="nutrio-log-notes">
								{ __( 'Log something else', 'nutrio' ) }
							</label>
							<textarea
								id="nutrio-log-notes"
								value={ notes }
								onChange={ ( event ) =>
									setNotes( event.target.value )
								}
								placeholder={ __(
									'What did you eat?',
									'nutrio'
								) }
								required
							/>
						</div>
						<Button
							type="submit"
							variant="primary"
							disabled={ isSubmittingAdHoc }
						>
							{ __( 'Log it', 'nutrio' ) }
						</Button>
					</form>
				</PanelBody>
			</Panel>

			<Panel className={ styles.historyPanel }>
				<PanelBody>
					<h3 className={ styles.historyTitle }>
						{ __( 'Recent history', 'nutrio' ) }
					</h3>

					{ undefined === history && (
						<p>{ __( 'Loading…', 'nutrio' ) }</p>
					) }

					{ history && pastDates.length === 0 && (
						<p className={ styles.empty }>
							{ __( 'Nothing logged yet.', 'nutrio' ) }
						</p>
					) }

					{ pastDates.map( ( date ) => (
						<div key={ date } className={ styles.historyDay }>
							<div className={ styles.historyDate }>
								{ formatDate( date ) }
							</div>
							<ul className={ styles.historyList }>
								{ ( historyByDate[ date ] ?? [] ).map(
									( entry ) => (
										<li
											key={ entry.id }
											className={ styles.historyItem }
										>
											<div>
												<div
													className={
														styles.historyLabel
													}
												>
													{ entryLabel(
														entry,
														itemLabels
													) }
												</div>
												{ entry.notes &&
													null !==
														entry.plan_item_id && (
														<div
															className={
																styles.historyNote
															}
														>
															{ entry.notes }
														</div>
													) }
											</div>
											<span
												className={ `${
													styles.statusPill
												} ${ styles[ entry.status ] }` }
											>
												{
													STATUS_LABELS[
														entry.status
													]
												}
											</span>
										</li>
									)
								) }
							</ul>
						</div>
					) ) }
				</PanelBody>
			</Panel>
		</>
	);
}
