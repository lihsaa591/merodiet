import { __, sprintf } from '@wordpress/i18n';
import Panel, { PanelBody } from '../../components/ui/Panel';
import Button from '../../components/ui/Button';
import BulkActionBar from '../../components/ui/BulkActionBar';
import IconButton from '../../components/ui/IconButton';
import Chip from '../../components/ui/Chip';
import Pagination from '../../components/ui/Pagination';
import ListFilters, {
	type StatusFilterOption,
} from '../../components/ui/ListFilters';
import { useBulkSelection } from '../../hooks/useBulkSelection';
import { formatAmount, summarizeNutrients } from '../../utils/nutrients';
import { formatDate } from '../../utils/date';
import Avatar from '../../components/ui/Avatar';
import { clientDetailUrl } from '../../utils/clientUrl';
import type { Client, Plan } from '../../types';

interface PlanLibraryProps {
	plans: Plan[];
	clients: Client[];
	isLoading: boolean;
	page: number;
	totalPages: number;
	onPageChange: ( page: number ) => void;
	total: number;
	perPage: number;
	onPerPageChange: ( perPage: number ) => void;
	search: string;
	onSearchChange: ( value: string ) => void;
	status: string;
	onStatusChange: ( value: string ) => void;
	statusOptions: StatusFilterOption[];
	showFilters: boolean;
	isFiltering: boolean;
	onAdd: () => void;
	onEdit: ( id: number ) => void;
	onDelete: ( plan: Plan ) => void;
	onBulkDelete: ( plans: Plan[] ) => Promise< void >;
	onBulkUnassign: ( plans: Plan[] ) => Promise< void >;
}

export default function PlanLibrary( {
	plans,
	clients,
	isLoading,
	page,
	totalPages,
	onPageChange,
	total,
	perPage,
	onPerPageChange,
	search,
	onSearchChange,
	status,
	onStatusChange,
	statusOptions,
	showFilters,
	isFiltering,
	onAdd,
	onEdit,
	onDelete,
	onBulkDelete,
	onBulkUnassign,
}: PlanLibraryProps ) {
	const bulk = useBulkSelection( plans );
	const selectedAssigned = bulk.selectedItems.filter(
		( plan ) => plan.status === 'assigned'
	);

	const handleBulkDelete = async () => {
		await onBulkDelete( bulk.selectedItems );
		bulk.clear();
	};

	const handleBulkUnassign = async () => {
		await onBulkUnassign( selectedAssigned );
		bulk.clear();
	};

	// The list endpoint resolves the client itself; the loaded roster is only
	// a fallback (e.g. a plan returned from a create/assign response).
	const renderClientCell = ( row: Plan ) => {
		if ( null === row.client_id ) {
			return __( 'Unassigned', 'nutrio' );
		}

		const client =
			row.client ?? clients.find( ( c ) => c.id === row.client_id );

		if ( ! client ) {
			return __( 'Unknown client', 'nutrio' );
		}

		return (
			<a
				href={ clientDetailUrl( row.client_id ) }
				style={ {
					display: 'inline-flex',
					alignItems: 'center',
					gap: '10px',
					color: 'inherit',
					textDecoration: 'none',
				} }
			>
				<Avatar
					id={ client.id }
					firstName={ client.first_name }
					lastName={ client.last_name }
					avatarUrl={ client.avatar_url }
					size="sm"
				/>
				{ client.first_name } { client.last_name }
			</a>
		);
	};

	const avgDailyKcal = ( plan: Plan ): number | null => {
		const perDay = Object.values( plan.nutrient_totals ).map(
			( totals ) => summarizeNutrients( totals ).kcal ?? 0
		);
		return perDay.length === 0
			? null
			: perDay.reduce( ( a, b ) => a + b, 0 ) / perDay.length;
	};

	return (
		<>
			<div className="nutrio-topbar">
				<h1>{ __( 'Meal plans', 'nutrio' ) }</h1>
				<Button variant="primary" onClick={ onAdd }>
					<PlusIcon />
					{ __( 'New plan', 'nutrio' ) }
				</Button>
			</div>

			{ showFilters && (
				<ListFilters
					search={ search }
					onSearchChange={ onSearchChange }
					searchPlaceholder={ __( 'Search plans…', 'nutrio' ) }
					status={ status }
					onStatusChange={ onStatusChange }
					statusOptions={ statusOptions }
				/>
			) }

			<Panel>
				<PanelBody className="nutrio-table-wrap">
					{ isLoading && <p>{ __( 'Loading…', 'nutrio' ) }</p> }

					{ ! isLoading && plans.length === 0 && (
						<p>
							{ isFiltering
								? __( 'No plans match your search.', 'nutrio' )
								: __(
										'No plans yet. Build your first plan to start assigning nutrition to clients.',
										'nutrio'
								  ) }
						</p>
					) }

					{ ! isLoading && plans.length > 0 && (
						<>
							<BulkActionBar
								count={ bulk.count }
								onClear={ bulk.clear }
							>
								<Button
									variant="ghost"
									onClick={ handleBulkUnassign }
									disabled={ selectedAssigned.length === 0 }
								>
									{ sprintf(
										/* translators: %d: number of assigned plans selected */
										__(
											'Unassign selected (%d)',
											'nutrio'
										),
										selectedAssigned.length
									) }
								</Button>
								<Button
									variant="primary"
									destructive
									onClick={ handleBulkDelete }
								>
									{ sprintf(
										/* translators: %d: number of plans selected */
										__( 'Delete selected (%d)', 'nutrio' ),
										bulk.count
									) }
								</Button>
							</BulkActionBar>

							<table className="nutrio-table">
								<thead>
									<tr>
										<th>
											<input
												type="checkbox"
												checked={ bulk.isAllSelected }
												ref={ ( el ) => {
													if ( el ) {
														el.indeterminate =
															bulk.isSomeSelected;
													}
												} }
												onChange={ bulk.toggleAll }
												aria-label={ __(
													'Select all plans',
													'nutrio'
												) }
											/>
										</th>
										<th>{ __( 'Title', 'nutrio' ) }</th>
										<th>{ __( 'Client', 'nutrio' ) }</th>
										<th>{ __( 'Dates', 'nutrio' ) }</th>
										<th>
											{ __( 'Avg. kcal/day', 'nutrio' ) }
										</th>
										<th>{ __( 'Status', 'nutrio' ) }</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									{ plans.map( ( plan ) => (
										<tr key={ plan.id }>
											<td>
												<input
													type="checkbox"
													checked={ bulk.isSelected(
														plan.id
													) }
													onChange={ () =>
														bulk.toggle( plan.id )
													}
													aria-label={ sprintf(
														/* translators: %s: plan title */
														__(
															'Select %s',
															'nutrio'
														),
														plan.title
													) }
												/>
											</td>
											<td style={ { fontWeight: 600 } }>
												{ plan.title }
											</td>
											<td>
												{ renderClientCell( plan ) }
											</td>
											<td>
												<div
													style={ {
														display: 'flex',
														flexDirection: 'column',
														gap: '2px',
													} }
												>
													<span>
														<span
															style={ {
																color: 'var(--ink-faint)',
																marginRight:
																	'4px',
															} }
														>
															{ __(
																'Start:',
																'nutrio'
															) }
														</span>
														<span>
															{ formatDate(
																plan.start_date
															) }
														</span>
													</span>
													<span>
														<span
															style={ {
																color: 'var(--ink-faint)',
																marginRight:
																	'4px',
															} }
														>
															{ __(
																'End:',
																'nutrio'
															) }
														</span>
														<span>
															{ formatDate(
																plan.end_date
															) }
														</span>
													</span>
												</div>
											</td>
											<td className="nutrio-mono">
												{ formatAmount(
													avgDailyKcal( plan ),
													''
												) }
											</td>
											<td>
												<Chip
													tone={
														plan.status ===
														'assigned'
															? 'success'
															: 'clay'
													}
												>
													{ plan.status }
												</Chip>
											</td>
											<td>
												<div className="nutrio-row-actions">
													<IconButton
														label={ __(
															'Open plan',
															'nutrio'
														) }
														onClick={ () =>
															onEdit( plan.id )
														}
													>
														<EditIcon />
													</IconButton>
													<IconButton
														label={ __(
															'Remove plan',
															'nutrio'
														) }
														onClick={ () =>
															onDelete( plan )
														}
													>
														<TrashIcon />
													</IconButton>
												</div>
											</td>
										</tr>
									) ) }
								</tbody>
							</table>
						</>
					) }
				</PanelBody>
			</Panel>

			<Pagination
				page={ page }
				totalPages={ totalPages }
				onPageChange={ onPageChange }
				total={ total }
				perPage={ perPage }
				onPerPageChange={ onPerPageChange }
			/>
		</>
	);
}

function PlusIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		>
			<path d="M12 5v14M5 12h14" />
		</svg>
	);
}

function EditIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		>
			<path d="M12 20h9" />
			<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
		</svg>
	);
}

function TrashIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
		>
			<path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" />
		</svg>
	);
}
