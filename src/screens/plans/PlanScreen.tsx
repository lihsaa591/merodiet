import { useState } from '@wordpress/element';
import { useSelect, useDispatch } from '@wordpress/data';
import { __, sprintf } from '@wordpress/i18n';
import { useQueryParam } from '../../hooks/useQueryParam';
import { STORE_NAME } from '../../store/plans';
import { confirmDialog } from '../../utils/confirmDialog';
import { STORE_NAME as CLIENTS_STORE } from '../../store/clients';
import AssignModal from '../../components/plans/AssignModal';
import PlanLibrary from './PlanLibrary';
import PlanBuilder from './PlanBuilder';
import type { Client, Plan, PlanInput } from '../../types';

interface PlansStoreSelectors {
	getPlans: () => Plan[];
	getPlan: ( id: number ) => Plan | null;
	hasFinishedResolution: ( selector: string, args?: unknown[] ) => boolean;
}

interface ClientsStoreSelectors {
	getClients: () => Client[];
}

export default function PlanScreen() {
	const [ idParam, setIdParam ] = useQueryParam( 'id' );
	const [ isAssignModalOpen, setAssignModalOpen ] = useState( false );

	const editingId = idParam && idParam !== 'new' ? Number( idParam ) : null;

	const { plans, isLoading, clients, isEditingPlanLoading } = useSelect(
		( select ) => {
			const plansStore = select(
				STORE_NAME
			) as unknown as PlansStoreSelectors;
			const clientsStore = select(
				CLIENTS_STORE
			) as unknown as ClientsStoreSelectors;

			// list_plans only returns totals, not days/items (an N+1 query the
			// list view never reads) — opening a specific plan for editing
			// needs the full detail, so fetch it via its own resolver.
			if ( editingId !== null ) {
				plansStore.getPlan( editingId );
			}

			return {
				plans: plansStore.getPlans(),
				isLoading: ! plansStore.hasFinishedResolution( 'getPlans' ),
				clients: clientsStore.getClients(),
				isEditingPlanLoading:
					editingId !== null &&
					! plansStore.hasFinishedResolution( 'getPlan', [
						editingId,
					] ),
			};
		},
		[ editingId ]
	);

	const { createPlan, updatePlan, deletePlan, assignPlan, unassignPlan } =
		useDispatch( STORE_NAME ) as {
			createPlan: ( data: PlanInput ) => Promise< Plan >;
			updatePlan: (
				id: number,
				data: Partial< PlanInput >
			) => Promise< Plan >;
			deletePlan: ( id: number ) => Promise< void >;
			assignPlan: ( id: number, clientId: number ) => Promise< Plan >;
			unassignPlan: ( id: number ) => Promise< Plan >;
		};

	const editingPlan = plans.find( ( plan ) => plan.id === editingId ) ?? null;

	const openAdd = () => setIdParam( 'new' );
	const openEdit = ( id: number ) => setIdParam( String( id ) );
	const backToList = () => setIdParam( null );

	const handleSave = async ( data: PlanInput ) => {
		if ( editingPlan ) {
			await updatePlan( editingPlan.id, data );
		} else {
			const created = await createPlan( data );
			setIdParam( String( created.id ) );
			return;
		}
		backToList();
	};

	const handleDelete = async ( plan: Plan ) => {
		const confirmed = await confirmDialog( {
			message: __( 'Remove this plan? This cannot be undone.', 'nutrio' ),
			confirmLabel: __( 'Remove', 'nutrio' ),
			destructive: true,
		} );
		if ( confirmed ) {
			deletePlan( plan.id );
		}
	};

	const handleBulkDelete = async ( selected: Plan[] ) => {
		const confirmed = await confirmDialog( {
			message: sprintf(
				/* translators: %d: number of plans being removed */
				__(
					'Remove %d selected plan(s)? This cannot be undone.',
					'nutrio'
				),
				selected.length
			),
			confirmLabel: __( 'Remove', 'nutrio' ),
			destructive: true,
		} );
		if ( confirmed ) {
			await Promise.allSettled(
				selected.map( ( p ) => deletePlan( p.id ) )
			);
		}
	};

	const handleBulkUnassign = async ( selected: Plan[] ) => {
		if ( selected.length === 0 ) {
			return;
		}
		const confirmed = await confirmDialog( {
			message: sprintf(
				/* translators: %d: number of assigned plans being unassigned */
				__(
					'Unassign %d selected plan(s)? They go back to being editable drafts, and their clients no longer have access.',
					'nutrio'
				),
				selected.length
			),
			confirmLabel: __( 'Unassign', 'nutrio' ),
			destructive: true,
		} );
		if ( confirmed ) {
			await Promise.allSettled(
				selected.map( ( p ) => unassignPlan( p.id ) )
			);
		}
	};

	const handleAssign = async ( clientId: number ) => {
		if ( ! editingPlan ) {
			return;
		}
		await assignPlan( editingPlan.id, clientId );
		setAssignModalOpen( false );
	};

	const handleUnassign = async () => {
		if ( ! editingPlan ) {
			return;
		}
		const confirmed = await confirmDialog( {
			message: __(
				'Unassign this plan? It goes back to being an editable draft, and the client no longer has access to it.',
				'nutrio'
			),
			confirmLabel: __( 'Unassign', 'nutrio' ),
			destructive: true,
		} );
		if ( confirmed ) {
			unassignPlan( editingPlan.id );
		}
	};

	// Assigned plans stay frozen (their nutrient snapshot must never
	// silently change), so "editing" one means cloning it into a fresh,
	// fully-editable draft rather than mutating the original in place.
	const handleDuplicate = async () => {
		if ( ! editingPlan ) {
			return;
		}
		const created = await createPlan( {
			title: `${ editingPlan.title } (copy)`,
			start_date: editingPlan.start_date,
			end_date: editingPlan.end_date,
			days: editingPlan.days.map( ( day ) => ( {
				day_offset: day.day_offset,
				items: day.items.map( ( item ) => ( {
					meal_type: item.meal_type,
					food_id: item.food_id ?? undefined,
					recipe_id: item.recipe_id ?? undefined,
					quantity_grams: item.quantity_grams ?? undefined,
					servings: item.servings ?? undefined,
				} ) ),
			} ) ),
		} );
		setIdParam( String( created.id ) );
	};

	if ( idParam !== null ) {
		if ( isEditingPlanLoading || ( editingId !== null && ! editingPlan ) ) {
			return <p>{ __( 'Loading…', 'nutrio' ) }</p>;
		}

		return (
			<>
				<PlanBuilder
					key={ idParam }
					plan={ editingPlan }
					onSave={ handleSave }
					onCancel={ backToList }
					onAssignClick={ () => setAssignModalOpen( true ) }
					onDuplicateClick={ handleDuplicate }
					onUnassignClick={ handleUnassign }
				/>
				{ editingPlan && (
					<AssignModal
						isOpen={ isAssignModalOpen }
						plan={ editingPlan }
						clients={ clients }
						onAssign={ handleAssign }
						onClose={ () => setAssignModalOpen( false ) }
					/>
				) }
			</>
		);
	}

	return (
		<PlanLibrary
			plans={ plans }
			clients={ clients }
			isLoading={ isLoading }
			onAdd={ openAdd }
			onEdit={ openEdit }
			onDelete={ handleDelete }
			onBulkDelete={ handleBulkDelete }
			onBulkUnassign={ handleBulkUnassign }
		/>
	);
}
