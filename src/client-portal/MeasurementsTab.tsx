import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import { doAction } from '@wordpress/hooks';
import Button from '../components/ui/Button';
import type { Measurement, MeasurementInput } from '../types';
import styles from './MeasurementsTab.module.css';

type Unit = 'kg' | 'lb';

const UNIT_STORAGE_KEY = 'nutrio-client-portal-weight-unit';

function readStoredUnit(): Unit {
	try {
		const stored = window.localStorage.getItem( UNIT_STORAGE_KEY );
		return 'lb' === stored ? 'lb' : 'kg';
	} catch {
		return 'kg';
	}
}

function storeUnit( unit: Unit ): void {
	try {
		window.localStorage.setItem( UNIT_STORAGE_KEY, unit );
	} catch {
		// Private browsing / blocked storage — the preference just won't persist.
	}
}

function gramsToDisplay( grams: number, unit: Unit ): number {
	return (
		Math.round( ( 'lb' === unit ? grams / 453.592 : grams / 1000 ) * 10 ) /
		10
	);
}

function displayToGrams( value: number, unit: Unit ): number {
	return Math.round( 'lb' === unit ? value * 453.592 : value * 1000 );
}

export default function MeasurementsTab() {
	const [ unit, setUnit ] = useState< Unit >( readStoredUnit );
	const [ measurements, setMeasurements ] = useState<
		Measurement[] | undefined
	>( undefined );
	const [ weightInput, setWeightInput ] = useState( '' );
	const [ isSubmitting, setIsSubmitting ] = useState( false );
	const [ errorMessage, setErrorMessage ] = useState< string | null >( null );

	const loadMeasurements = () => {
		apiFetch< Measurement[] >( {
			path: '/nutrio/v1/me/measurements',
		} ).then( setMeasurements, () => setMeasurements( [] ) );
	};

	useEffect( loadMeasurements, [] );

	const changeUnit = ( next: Unit ) => {
		setUnit( next );
		storeUnit( next );
	};

	const submit = async ( event: React.FormEvent ) => {
		event.preventDefault();
		const value = parseFloat( weightInput );

		if ( ! value || value <= 0 ) {
			return;
		}

		setIsSubmitting( true );

		try {
			const payload: MeasurementInput = {
				measured_at: new Date().toISOString().slice( 0, 10 ),
				weight_grams: displayToGrams( value, unit ),
			};
			const entry = await apiFetch< Measurement >( {
				path: '/nutrio/v1/me/measurements',
				method: 'POST',
				data: payload,
			} );
			doAction( 'nutrio.clientPortal.measurementCreated', entry );
			setWeightInput( '' );
			setErrorMessage( null );
			loadMeasurements();
		} catch {
			setErrorMessage(
				__( 'Something went wrong — please try again.', 'nutrio' )
			);
		} finally {
			setIsSubmitting( false );
		}
	};

	return (
		<div>
			<form onSubmit={ submit } className={ styles.form }>
				<label htmlFor="nutrio-weight-input">
					{ __( 'Weight', 'nutrio' ) }
				</label>
				{ errorMessage && (
					<p className={ styles.error }>{ errorMessage }</p>
				) }
				<div className={ styles.weightRow }>
					<input
						id="nutrio-weight-input"
						type="number"
						step="0.1"
						min="0"
						value={ weightInput }
						onChange={ ( event ) =>
							setWeightInput( event.target.value )
						}
						required
					/>
					<select
						value={ unit }
						onChange={ ( event ) =>
							changeUnit( event.target.value as Unit )
						}
					>
						<option value="kg">{ __( 'kg', 'nutrio' ) }</option>
						<option value="lb">{ __( 'lb', 'nutrio' ) }</option>
					</select>
				</div>
				<Button
					type="submit"
					variant="primary"
					disabled={ isSubmitting }
				>
					{ __( 'Log weight', 'nutrio' ) }
				</Button>
			</form>

			<h3 className={ styles.historyTitle }>
				{ __( 'History', 'nutrio' ) }
			</h3>
			{ undefined === measurements && (
				<p>{ __( 'Loading…', 'nutrio' ) }</p>
			) }
			{ measurements && 0 === measurements.length && (
				<p className={ styles.empty }>
					{ __( 'No measurements logged yet.', 'nutrio' ) }
				</p>
			) }
			{ measurements && measurements.length > 0 && (
				<ul className={ styles.historyList }>
					{ measurements.map( ( measurement ) => (
						<li
							key={ measurement.id }
							className={ styles.historyItem }
						>
							<span>{ measurement.measured_at }</span>
							<span>
								{ null !== measurement.weight_grams
									? `${ gramsToDisplay(
											measurement.weight_grams,
											unit
									  ) } ${ unit }`
									: '—' }
							</span>
						</li>
					) ) }
				</ul>
			) }
		</div>
	);
}
