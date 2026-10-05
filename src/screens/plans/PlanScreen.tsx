import { useState } from '@wordpress/element';
import { useSelect, useDispatch } from '@wordpress/data';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useQueryParam } from '../../hooks/useQueryParam';
import { usePagination } from '../../hooks/usePagination';
import { useShowFilters } from '../../hooks/useShowFilters';
import { STORE_NAME } from '../../store/plans';
import { confirmDialog } from '../../utils/confirmDialog';
import { errorMessage, reportBulkResult, toast } from '../../utils/toast';
import { STORE_NAME as CLIENTS_STORE } from '../../store/clients';
import AssignModal from '../../components/plans/AssignModal';
import PlanLibrary from './PlanLibrary';
import PlanBuilder from './PlanBuilder';
import type { Client, Plan, PlanInput } from '../../types';

interface PlansStoreSelectors {
	getPlansPage: (
		page: number,
		perPage: number,
		filters: Record< string, string >
	) => Plan[];
	getPlansTotal: () => number;
	getPlansTotalPages: () => number;
	getPlan: ( id: number ) => Plan | null;
	hasFinishedResolution: ( selector: string, args?: unknown[] ) => boolean;
}

interface ClientsStoreSelectors {
	getClients: () => Client[];
}

const PLAN_FILTER_DEFAULTS = { search: '', status: '' };
const PLAN_STATUS_OPTIONS = [
	{ value: '', label: __( 'All statuses', 'merodiet' ) },
	{ value: 'draft', label: __( 'Draft', 'merodiet' ) },
	{ value: 'assigned', label: __( 'Assigned', 'merodiet' ) },
];

export default function PlanScreen() {
	const [ idParam, setIdParam ] = useQueryParam( 'id' );
	const [ isAssignModalOpen, setAssignModalOpen ] = useState( false );
	const { page, perPage, filters, setPage, setPerPage, setFilter } =
		usePagination( 'plans', { filterDefaults: PLAN_FILTER_DEFAULTS } );

	const editingId = idParam && idParam !== 'new' ? Number( idParam ) : null;

	const {
		plans,
		total,
		totalPages,
		isLoading,
		clients,
		editingPlan,
		isEditingPlanLoading,
	} = useSelect(
		( select ) => {
			const plansStore = select(
				STORE_NAME
			) as unknown as PlansStoreSelectors;
			const clientsStore = select(
				CLIENTS_STORE
			) as unknown as ClientsStoreSelectors;

			return {
				plans: plansStore.getPlansPage( page, perPage, filters ),
				total: plansStore.getPlansTotal(),
				totalPages: plansStore.getPlansTotalPages(),
				isLoading: ! plansStore.hasFinishedResolution( 'getPlansPage', [
					page,
					perPage,
					filters,
				] ),
				clients: clientsStore.getClients(),
				// list_plans only returns totals, not days/items (an N+1 query
				// the list view never reads) — opening a specific plan for
				// editing needs the full detail, fetched via its own resolver,
				// and looked up independently of whichever page is displayed.
				editingPlan:
					editingId !== null ? plansStore.getPlan( editingId ) : null,
				isEditingPlanLoading:
					editingId !== null &&
					! plansStore.hasFinishedResolution( 'getPlan', [
						editingId,
					] ),
			};
		},
		[ editingId, page, perPage, filters ]
	);

	const isFiltering = Boolean( filters.search || filters.status );
	const showFilters = useShowFilters( total, isFiltering );

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

	const openAdd = () => setIdParam( 'new' );
	const openEdit = ( id: number ) => setIdParam( String( id ) );
	const backToList = () => setIdParam( null );

	const handleSave = async ( data: PlanInput ) => {
		if ( editingPlan ) {
			await updatePlan( editingPlan.id, data );
			toast.success( __( 'Plan saved.', 'merodiet' ) );
		} else {
			const created = await createPlan( data );
			toast.success( __( 'Plan created.', 'merodiet' ) );
			setIdParam( String( created.id ) );
			return;
		}
		backToList();
	};

	const handleDelete = async ( plan: Plan ) => {
		const confirmed = await confirmDialog( {
			message: __(
				'Remove this plan? This cannot be undone.',
				'merodiet'
			),
			confirmLabel: __( 'Remove', 'merodiet' ),
			destructive: true,
		} );
		if ( ! confirmed ) {
			return;
		}

		try {
			await deletePlan( plan.id );
			toast.success( __( 'Plan removed.', 'merodiet' ) );
		} catch ( error ) {
			toast.error(
				errorMessage(
					error,
					__( 'Could not remove this plan.', 'merodiet' )
				)
			);
		}
	};

	const handleBulkDelete = async ( selected: Plan[] ) => {
		const confirmed = await confirmDialog( {
			message: sprintf(
				/* translators: %d: number of plans being removed */
				__(
					'Remove %d selected plan(s)? This cannot be undone.',
					'merodiet'
				),
				selected.length
			),
			confirmLabel: __( 'Remove', 'merodiet' ),
			destructive: true,
		} );
		if ( confirmed ) {
			const results = await Promise.allSettled(
				selected.map( ( p ) => deletePlan( p.id ) )
			);
			reportBulkResult( results, {
				success: ( count ) =>
					sprintf(
						/* translators: %d: number of plans removed */
						_n(
							'%d plan removed.',
							'%d plans removed.',
							count,
							'merodiet'
						),
						count
					),
				failure: __( 'Some plans could not be removed.', 'merodiet' ),
			} );
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
					'merodiet'
				),
				selected.length
			),
			confirmLabel: __( 'Unassign', 'merodiet' ),
			destructive: true,
		} );
		if ( confirmed ) {
			const results = await Promise.allSettled(
				selected.map( ( p ) => unassignPlan( p.id ) )
			);
			reportBulkResult( results, {
				success: ( count ) =>
					sprintf(
						/* translators: %d: number of plans unassigned */
						_n(
							'%d plan unassigned.',
							'%d plans unassigned.',
							count,
							'merodiet'
						),
						count
					),
				failure: __(
					'Some plans could not be unassigned.',
					'merodiet'
				),
			} );
		}
	};

	const handleAssign = async ( clientId: number ) => {
		if ( ! editingPlan ) {
			return;
		}
		try {
			await assignPlan( editingPlan.id, clientId );
			setAssignModalOpen( false );
			toast.success( __( 'Plan assigned.', 'merodiet' ) );
		} catch ( error ) {
			toast.error(
				errorMessage(
					error,
					__( 'Could not assign this plan.', 'merodiet' )
				)
			);
		}
	};

	const handleUnassign = async () => {
		if ( ! editingPlan ) {
			return;
		}
		const confirmed = await confirmDialog( {
			message: __(
				'Unassign this plan? It goes back to being an editable draft, and the client no longer has access to it.',
				'merodiet'
			),
			confirmLabel: __( 'Unassign', 'merodiet' ),
			destructive: true,
		} );
		if ( ! confirmed ) {
			return;
		}

		try {
			await unassignPlan( editingPlan.id );
			toast.success( __( 'Plan unassigned.', 'merodiet' ) );
		} catch ( error ) {
			toast.error(
				errorMessage(
					error,
					__( 'Could not unassign this plan.', 'merodiet' )
				)
			);
		}
	};

	// Assigned plans stay frozen (their nutrient snapshot must never
	// silently change), so "editing" one means cloning it into a fresh,
	// fully-editable draft rather than mutating the original in place.
	const handleDuplicate = async () => {
		if ( ! editingPlan ) {
			return;
		}
		let created: Plan;

		try {
			created = await createPlan( {
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
		} catch ( error ) {
			toast.error(
				errorMessage(
					error,
					__( 'Could not duplicate this plan.', 'merodiet' )
				)
			);
			return;
		}

		toast.success( __( 'Plan duplicated as a new draft.', 'merodiet' ) );
		setIdParam( String( created.id ) );
	};

	if ( idParam !== null ) {
		if ( isEditingPlanLoading || ( editingId !== null && ! editingPlan ) ) {
			return <p>{ __( 'Loading…', 'merodiet' ) }</p>;
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
			page={ page }
			totalPages={ totalPages }
			onPageChange={ setPage }
			total={ total }
			perPage={ perPage }
			onPerPageChange={ setPerPage }
			search={ filters.search }
			onSearchChange={ ( value ) => setFilter( 'search', value ) }
			status={ filters.status }
			onStatusChange={ ( value ) => setFilter( 'status', value ) }
			statusOptions={ PLAN_STATUS_OPTIONS }
			showFilters={ showFilters }
			isFiltering={ isFiltering }
			onAdd={ openAdd }
			onEdit={ openEdit }
			onDelete={ handleDelete }
			onBulkDelete={ handleBulkDelete }
			onBulkUnassign={ handleBulkUnassign }
		/>
	);
}
