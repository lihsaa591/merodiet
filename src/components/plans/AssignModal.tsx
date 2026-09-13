import { useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import Button from '../ui/Button';
import Chip from '../ui/Chip';
import styles from './AssignModal.module.css';
import type { Client, Plan } from '../../types';

interface AssignModalProps {
	isOpen: boolean;
	plan: Plan;
	clients: Client[];
	onAssign: ( clientId: number ) => Promise< void >;
	onClose: () => void;
}

// Case-insensitive substring match of a client's declared allergies against
// every item's label in the plan. Known limitation (see design spec): this
// is not a real allergen taxonomy — it misses synonyms, plurals, and
// category-level allergens (e.g. "tree nuts" won't catch "almonds" unless
// the client's own allergy text says "almond"). Revisit if this proves
// insufficient in practice.
function findAllergyConflicts( plan: Plan, client: Client ): string[] {
	const itemLabels = plan.days
		.flatMap( ( day ) => day.items )
		.map( ( item ) =>
			( item.food_description ?? item.recipe_name ?? '' ).toLowerCase()
		);

	return client.allergies.filter( ( allergy ) =>
		itemLabels.some( ( label ) => label.includes( allergy.toLowerCase() ) )
	);
}

export default function AssignModal( {
	isOpen,
	plan,
	clients,
	onAssign,
	onClose,
}: AssignModalProps ) {
	const [ selectedClientId, setSelectedClientId ] = useState< number | null >(
		null
	);
	const [ isAssigning, setIsAssigning ] = useState( false );

	if ( ! isOpen ) {
		return null;
	}

	const selectedClient =
		clients.find( ( c ) => c.id === selectedClientId ) ?? null;
	const conflicts = selectedClient
		? findAllergyConflicts( plan, selectedClient )
		: [];

	const handleAssign = async () => {
		if ( ! selectedClientId ) {
			return;
		}
		setIsAssigning( true );
		try {
			await onAssign( selectedClientId );
		} finally {
			setIsAssigning( false );
		}
	};

	return (
		// eslint-disable-next-line jsx-a11y/click-events-have-key-events,jsx-a11y/no-static-element-interactions
		<div
			className={ styles.modalScrim }
			onClick={ ( e ) => e.target === e.currentTarget && onClose() }
		>
			<div className={ styles.modal }>
				<h3>{ __( 'Assign to client', 'nutrio' ) }</h3>

				<div
					className="nutrio-field"
					style={ { marginBottom: '14px' } }
				>
					<label htmlFor="nutrio-assign-client">
						{ __( 'Client', 'nutrio' ) }
					</label>
					<select
						id="nutrio-assign-client"
						value={ selectedClientId ?? '' }
						onChange={ ( e ) =>
							setSelectedClientId(
								e.target.value ? Number( e.target.value ) : null
							)
						}
					>
						<option value="">
							{ __( 'Select a client…', 'nutrio' ) }
						</option>
						{ clients.map( ( client ) => (
							<option key={ client.id } value={ client.id }>
								{ client.first_name } { client.last_name }
							</option>
						) ) }
					</select>
				</div>

				{ selectedClient && selectedClient.allergies.length > 0 && (
					<div
						className="nutrio-field"
						style={ { marginBottom: '14px' } }
					>
						<div className="nutrio-field-hint">
							{ __( "Client's declared allergies", 'nutrio' ) }
						</div>
						<div
							style={ {
								display: 'flex',
								flexWrap: 'wrap',
								gap: '6px',
							} }
						>
							{ selectedClient.allergies.map( ( allergy ) => (
								<Chip key={ allergy } tone="clay">
									{ allergy }
								</Chip>
							) ) }
						</div>
					</div>
				) }

				{ conflicts.length > 0 && (
					<p className={ styles.conflictWarning }>
						{ sprintf(
							/* translators: %s: comma-separated list of the client's declared allergies found in this plan */
							__(
								"This plan contains an item matching this client's declared allergies: %s. Assignment is blocked.",
								'nutrio'
							),
							conflicts.join( ', ' )
						) }
					</p>
				) }

				{ selectedClient && (
					<p className={ styles.lockNotice }>
						{ __(
							'Once assigned, this plan becomes read-only — its numbers are frozen and it can no longer be edited directly. To make changes later, unassign it or duplicate it as a new plan.',
							'nutrio'
						) }
					</p>
				) }

				<div className={ styles.modalActions }>
					<Button
						variant="primary"
						onClick={ handleAssign }
						disabled={
							! selectedClientId ||
							conflicts.length > 0 ||
							isAssigning
						}
						style={ { justifyContent: 'center' } }
					>
						{ __( 'Assign', 'nutrio' ) }
					</Button>
					<Button
						variant="ghost"
						onClick={ onClose }
						disabled={ isAssigning }
						style={ { justifyContent: 'center' } }
					>
						{ __( 'Cancel', 'nutrio' ) }
					</Button>
				</div>
			</div>
		</div>
	);
}
