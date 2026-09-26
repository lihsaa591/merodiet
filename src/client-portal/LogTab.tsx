import { useEffect, useState } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import { doAction } from '@wordpress/hooks';
import Button from '../components/ui/Button';
import Panel, { PanelBody } from '../components/ui/Panel';
import Skeleton from '../components/ui/Skeleton';
import LogHistoryList from '../components/clients/LogHistoryList';
import {
	MEAL_ORDER,
	MEAL_LABELS,
	MEAL_ICONS,
	itemsByMeal,
	itemQuantityLabel,
	toEstimateInput,
	todaysDayOffset,
} from './mealMeta';
import { estimateDayNutrients, formatAmount } from '../utils/nutrients';
import type { LogEntry, LogEntryInput, Plan, PlanItem } from '../types';
import styles from './LogTab.module.css';

type Status = 'eaten' | 'substituted' | 'skipped';

const STATUS_LABELS: Record< Status, string > = {
	eaten: __( 'Eaten', 'nutrio' ),
	substituted: __( 'Substituted', 'nutrio' ),
	skipped: __( 'Skipped', 'nutrio' ),
};

// How many days back the "Recent history" section looks, including
// today — starts at one page, "Load more" widens the window up to the cap.
const HISTORY_PAGE_DAYS = 7;
const HISTORY_MAX_DAYS = 90;

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

interface LoggedItem {
	status: Status;
	notes: string | null;
}

// Mirrors today's items list — progress line, a couple of meal groups
// with an item + action-buttons row each.
function LogTabSkeleton() {
	return (
		<div>
			<div style={ { marginBottom: '16px' } }>
				<Skeleton width="120px" height="13px" />
			</div>
			{ [ 0, 1 ].map( ( meal ) => (
				<div key={ meal } className={ styles.meal }>
					<div style={ { marginBottom: '8px' } }>
						<Skeleton width="90px" height="15px" />
					</div>
					<div className={ styles.itemRow }>
						<Skeleton width="45%" height="14px" />
						<Skeleton width="90px" height="26px" shape="block" />
					</div>
				</div>
			) ) }
		</div>
	);
}

// Mirrors one day's worth of "Recent history" rows.
function HistorySkeleton() {
	return (
		<div>
			<div style={ { marginBottom: '6px' } }>
				<Skeleton width="100px" height="11px" />
			</div>
			{ [ 0, 1, 2 ].map( ( row ) => (
				<div key={ row } className={ styles.historyItem }>
					<div className={ styles.historyRow }>
						<Skeleton width="40%" height="13px" />
						<Skeleton width="70px" height="13px" />
					</div>
				</div>
			) ) }
		</div>
	);
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
	const [ historyRangeDays, setHistoryRangeDays ] =
		useState( HISTORY_PAGE_DAYS );
	const [ isLoadingMoreHistory, setIsLoadingMoreHistory ] = useState( false );
	const [ substitutingItemId, setSubstitutingItemId ] = useState<
		number | null
	>( null );
	const [ substituteNote, setSubstituteNote ] = useState( '' );

	const today = new Date().toISOString().slice( 0, 10 );

	const loadHistory = () => {
		apiFetch< LogEntry[] >( {
			path: `/nutrio/v1/me/logs?from=${ daysAgo(
				historyRangeDays - 1
			) }&to=${ today }`,
		} ).then( setHistory, () => setHistory( [] ) );
	};

	const loadMoreHistory = () => {
		const nextRange = Math.min(
			historyRangeDays + HISTORY_PAGE_DAYS,
			HISTORY_MAX_DAYS
		);
		setIsLoadingMoreHistory( true );

		apiFetch< LogEntry[] >( {
			path: `/nutrio/v1/me/logs?from=${ daysAgo(
				nextRange - 1
			) }&to=${ today }`,
		} )
			.then( ( entries ) => {
				setHistory( entries );
				setHistoryRangeDays( nextRange );
			} )
			.catch( () => {} )
			.finally( () => setIsLoadingMoreHistory( false ) );
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

	// Only "eaten" items count toward the kcal total — a substitution's
	// actual content is an unstructured note, not resolvable nutrient
	// data, and a skip means nothing was eaten. Counting the substitute
	// against the *planned* item's kcal would misrepresent what was
	// actually consumed, so it's excluded rather than guessed at.
	const eatenItems = todaysItems.filter(
		( item ) => 'eaten' === loggedByItem[ item.id ]?.status
	);
	const notCountedCount = todaysItems.filter( ( item ) => {
		const status = loggedByItem[ item.id ]?.status;
		return 'substituted' === status || 'skipped' === status;
	} ).length;
	const eatenKcal = estimateDayNutrients(
		eatenItems.map( toEstimateInput )
	).kcal;
	const plannedKcal = estimateDayNutrients(
		todaysItems.map( toEstimateInput )
	).kcal;

	const itemLabels = itemLabelsById( plan );
	const historyByDate: Record< string, LogEntry[] > = {};
	// Today's "Log something else" entries — not tied to a plan item, so
	// they never appear in the meal groups above; shown in their own list
	// instead of only via the toast (which fades) or tomorrow's history.
	const adHocToday: LogEntry[] = [];
	for ( const entry of history ?? [] ) {
		if ( entry.log_date === today ) {
			if ( null === entry.plan_item_id ) {
				adHocToday.push( entry );
			}
			continue; // Today's plan-item detail is already shown above.
		}
		( historyByDate[ entry.log_date ] ??= [] ).push( entry );
	}
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

					{ undefined === plan && <LogTabSkeleton /> }

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

							{ null !== eatenKcal && (
								<div className={ styles.kcalSummary }>
									<span className={ styles.kcalValue }>
										{ sprintf(
											/* translators: 1: kcal eaten so far today, 2: kcal planned for today */
											__(
												'%1$s of %2$s kcal eaten today',
												'nutrio'
											),
											formatAmount( eatenKcal, '' ),
											formatAmount( plannedKcal, '' )
										) }
									</span>
									{ notCountedCount > 0 && (
										<span className={ styles.kcalFootnote }>
											{ sprintf(
												/* translators: %d: number of items substituted or skipped today, excluded from the kcal count */
												_n(
													'%d item substituted or skipped, not counted toward this total.',
													'%d items substituted or skipped, not counted toward this total.',
													notCountedCount,
													'nutrio'
												),
												notCountedCount
											) }
										</span>
									) }
								</div>
							) }

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

					{ adHocToday.length > 0 && (
						<div className={ styles.adHocToday }>
							<h3 className={ styles.mealTitle }>
								{ __( 'Also logged today', 'nutrio' ) }
							</h3>
							<ul className={ styles.itemList }>
								{ adHocToday.map( ( entry ) => (
									<li
										key={ entry.id }
										className={ styles.historyItem }
									>
										<span className={ styles.itemName }>
											{ entry.notes }
										</span>
										<span
											className={ `${
												styles.statusPill
											} ${ styles[ entry.status ] }` }
										>
											{ STATUS_LABELS[ entry.status ] }
										</span>
									</li>
								) ) }
							</ul>
						</div>
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

					{ undefined === history && <HistorySkeleton /> }

					{ history && (
						<LogHistoryList
							entriesByDate={ historyByDate }
							itemLabels={ itemLabels }
						/>
					) }

					{ history && historyRangeDays < HISTORY_MAX_DAYS && (
						<button
							type="button"
							className={ styles.loadMore }
							onClick={ loadMoreHistory }
							disabled={ isLoadingMoreHistory }
						>
							{ isLoadingMoreHistory
								? __( 'Loading…', 'nutrio' )
								: __( 'Load more', 'nutrio' ) }
						</button>
					) }
				</PanelBody>
			</Panel>
		</>
	);
}
