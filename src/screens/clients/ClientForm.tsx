import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import Button from '../../components/ui/Button';
import type { Client, ClientInput } from '../../types';

interface FormValues {
	first_name: string;
	last_name: string;
	email: string;
	allergies: string;
}

const EMPTY: FormValues = {
	first_name: '',
	last_name: '',
	email: '',
	allergies: '',
};

interface ClientFormProps {
	client?: Client | null;
	onSubmit: ( data: ClientInput ) => Promise< void >;
	onCancel: () => void;
}

/**
 * Shared create/edit form. `client` is null for create, or an existing
 * client record for edit — the only difference the caller needs to
 * handle is which store action it dispatches on submit.
 */
export default function ClientForm( { client, onSubmit, onCancel }: ClientFormProps ) {
	const [ values, setValues ] = useState< FormValues >( () =>
		client
			? {
					first_name: client.first_name,
					last_name: client.last_name,
					email: client.email,
					allergies: ( client.allergies ?? [] ).join( ', ' ),
			  }
			: EMPTY
	);
	const [ isSaving, setIsSaving ] = useState( false );

	const setField =
		( field: keyof FormValues ) =>
		( event: React.ChangeEvent< HTMLInputElement > ) =>
			setValues( ( prev ) => ( { ...prev, [ field ]: event.target.value } ) );

	const handleSubmit = async ( event: React.FormEvent ) => {
		event.preventDefault();
		setIsSaving( true );

		try {
			await onSubmit( {
				first_name: values.first_name,
				last_name: values.last_name,
				email: values.email,
				allergies: values.allergies
					.split( ',' )
					.map( ( item ) => item.trim() )
					.filter( Boolean ),
			} );
		} finally {
			setIsSaving( false );
		}
	};

	return (
		<form onSubmit={ handleSubmit } style={ { display: 'flex', flexDirection: 'column', gap: '16px' } }>
			<div className="nutrio-field">
				<label htmlFor="nutrio-first-name">{ __( 'First name', 'nutrio' ) }</label>
				<input id="nutrio-first-name" type="text" value={ values.first_name } onChange={ setField( 'first_name' ) } required />
			</div>
			<div className="nutrio-field">
				<label htmlFor="nutrio-last-name">{ __( 'Last name', 'nutrio' ) }</label>
				<input id="nutrio-last-name" type="text" value={ values.last_name } onChange={ setField( 'last_name' ) } required />
			</div>
			<div className="nutrio-field">
				<label htmlFor="nutrio-email">{ __( 'Email', 'nutrio' ) }</label>
				<input id="nutrio-email" type="email" value={ values.email } onChange={ setField( 'email' ) } required />
			</div>
			<div className="nutrio-field">
				<label htmlFor="nutrio-allergies">{ __( 'Allergies & restrictions', 'nutrio' ) }</label>
				<input id="nutrio-allergies" type="text" value={ values.allergies } onChange={ setField( 'allergies' ) } placeholder={ __( 'Peanuts, shellfish', 'nutrio' ) } />
				<div className="nutrio-field-hint">{ __( 'Comma-separated', 'nutrio' ) }</div>
			</div>

			<div style={ { display: 'flex', gap: '10px' } }>
				<Button variant="primary" type="submit" disabled={ isSaving } style={ { flex: 1, justifyContent: 'center' } }>
					{ client ? __( 'Save changes', 'nutrio' ) : __( 'Add client', 'nutrio' ) }
				</Button>
				<Button variant="ghost" type="button" onClick={ onCancel } disabled={ isSaving }>
					{ __( 'Cancel', 'nutrio' ) }
				</Button>
			</div>
		</form>
	);
}
