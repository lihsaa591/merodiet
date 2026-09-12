import { __ } from '@wordpress/i18n';
import Panel, { PanelBody } from '../../components/ui/Panel';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import Chip from '../../components/ui/Chip';
import { formatAmount, summarizeNutrients } from '../../utils/nutrients';
import type { Client, Plan } from '../../types';

interface PlanLibraryProps {
	plans: Plan[];
	clients: Client[];
	isLoading: boolean;
	onAdd: () => void;
	onEdit: ( id: number ) => void;
	onDelete: ( plan: Plan ) => void;
}

export default function PlanLibrary( {
	plans,
	clients,
	isLoading,
	onAdd,
	onEdit,
	onDelete,
}: PlanLibraryProps ) {
	const clientName = ( clientId: number | null ): string => {
		const client = clients.find( ( c ) => c.id === clientId );
		return client
			? `${ client.first_name } ${ client.last_name }`
			: __( 'Unassigned', 'nutrio' );
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

			<Panel>
				<PanelBody className="nutrio-table-wrap">
					{ isLoading && <p>{ __( 'Loading…', 'nutrio' ) }</p> }

					{ ! isLoading && plans.length === 0 && (
						<p>
							{ __(
								'No plans yet. Build your first plan to start assigning nutrition to clients.',
								'nutrio'
							) }
						</p>
					) }

					{ ! isLoading && plans.length > 0 && (
						<table className="nutrio-table">
							<thead>
								<tr>
									<th>{ __( 'Title', 'nutrio' ) }</th>
									<th>{ __( 'Client', 'nutrio' ) }</th>
									<th>{ __( 'Dates', 'nutrio' ) }</th>
									<th>{ __( 'Avg. kcal/day', 'nutrio' ) }</th>
									<th>{ __( 'Status', 'nutrio' ) }</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{ plans.map( ( plan ) => (
									<tr key={ plan.id }>
										<td style={ { fontWeight: 600 } }>
											{ plan.title }
										</td>
										<td>
											{ clientName( plan.client_id ) }
										</td>
										<td className="nutrio-mono">
											{ plan.start_date } –{ ' ' }
											{ plan.end_date }
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
													plan.status === 'assigned'
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
					) }
				</PanelBody>
			</Panel>
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
