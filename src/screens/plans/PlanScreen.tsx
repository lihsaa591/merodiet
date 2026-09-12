import { useState } from '@wordpress/element';
import { useSelect, useDispatch } from '@wordpress/data';
import { __ } from '@wordpress/i18n';
import { useQueryParam } from '../../hooks/useQueryParam';
import { STORE_NAME } from '../../store/plans';
import { STORE_NAME as CLIENTS_STORE } from '../../store/clients';
import AssignModal from '../../components/plans/AssignModal';
import PlanLibrary from './PlanLibrary';
import PlanBuilder from './PlanBuilder';
import type { Client, Plan, PlanInput } from '../../types';

interface PlansStoreSelectors {
	getPlans: () => Plan[];
	hasFinishedResolution: ( selector: string ) => boolean;
}

interface ClientsStoreSelectors {
	getClients: () => Client[];
}

export default function PlanScreen() {
	const [ idParam, setIdParam ] = useQueryParam( 'id' );
	const [ isAssignModalOpen, setAssignModalOpen ] = useState( false );

	const { plans, isLoading, clients } = useSelect( ( select ) => {
		const plansStore = select(
			STORE_NAME
		) as unknown as PlansStoreSelectors;
		const clientsStore = select(
			CLIENTS_STORE
		) as unknown as ClientsStoreSelectors;

		return {
			plans: plansStore.getPlans(),
			isLoading: ! plansStore.hasFinishedResolution( 'getPlans' ),
			clients: clientsStore.getClients(),
		};
	}, [] );

	const { createPlan, updatePlan, deletePlan, assignPlan } = useDispatch(
		STORE_NAME
	) as {
		createPlan: ( data: PlanInput ) => Promise< Plan >;
		updatePlan: (
			id: number,
			data: Partial< PlanInput >
		) => Promise< Plan >;
		deletePlan: ( id: number ) => Promise< void >;
		assignPlan: ( id: number, clientId: number ) => Promise< Plan >;
	};

	const editingId = idParam && idParam !== 'new' ? Number( idParam ) : null;
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

	const handleDelete = ( plan: Plan ) => {
		if (
			// eslint-disable-next-line no-alert
			window.confirm(
				__( 'Remove this plan? This cannot be undone.', 'nutrio' )
			)
		) {
			deletePlan( plan.id );
		}
	};

	const handleAssign = async ( clientId: number ) => {
		if ( ! editingPlan ) {
			return;
		}
		await assignPlan( editingPlan.id, clientId );
		setAssignModalOpen( false );
	};

	if ( idParam !== null ) {
		return (
			<>
				<PlanBuilder
					key={ idParam }
					plan={ editingPlan }
					onSave={ handleSave }
					onCancel={ backToList }
					onAssignClick={ () => setAssignModalOpen( true ) }
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
		/>
	);
}
