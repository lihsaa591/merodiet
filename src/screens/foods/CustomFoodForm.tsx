import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import Button from '../../components/ui/Button';
import UnsavedBadge from '../../components/ui/UnsavedBadge';
import { useGlobalDirtyState } from '../../hooks/useGlobalDirtyState';
import { confirmDialog } from '../../utils/confirmDialog';
import { errorMessage, toast } from '../../utils/toast';
import type { CustomFood, CustomFoodInput } from '../../types';

interface NutrientFieldDef {
	key: keyof Omit< CustomFoodInput, 'name' >;
	label: string;
	unit: string;
}

// Same curated set (and order) as CustomFoodNutrientMap on the backend,
// grouped for the form the way a nutrition label groups them.
const MACROS: NutrientFieldDef[] = [
	{ key: 'calories', label: __( 'Calories', 'merodiet' ), unit: 'kcal' },
	{ key: 'protein', label: __( 'Protein', 'merodiet' ), unit: 'g' },
	{ key: 'carbs', label: __( 'Carbohydrates', 'merodiet' ), unit: 'g' },
	{ key: 'fat', label: __( 'Fat', 'merodiet' ), unit: 'g' },
	{
		key: 'saturated_fat',
		label: __( 'Saturated fat', 'merodiet' ),
		unit: 'g',
	},
	{ key: 'fiber', label: __( 'Fiber', 'merodiet' ), unit: 'g' },
	{ key: 'sugar', label: __( 'Sugar', 'merodiet' ), unit: 'g' },
	{ key: 'sodium', label: __( 'Sodium', 'merodiet' ), unit: 'mg' },
];

const VITAMINS_MINERALS: NutrientFieldDef[] = [
	{ key: 'cholesterol', label: __( 'Cholesterol', 'merodiet' ), unit: 'mg' },
	{ key: 'potassium', label: __( 'Potassium', 'merodiet' ), unit: 'mg' },
	{ key: 'calcium', label: __( 'Calcium', 'merodiet' ), unit: 'mg' },
	{ key: 'iron', label: __( 'Iron', 'merodiet' ), unit: 'mg' },
	{ key: 'vitamin_c', label: __( 'Vitamin C', 'merodiet' ), unit: 'mg' },
	{ key: 'vitamin_d', label: __( 'Vitamin D', 'merodiet' ), unit: 'mcg' },
];

type FormValues = { name: string } & Record< string, string >;

function toFormValues( food?: CustomFood | null ): FormValues {
	const values: FormValues = { name: food?.name ?? '' };

	for ( const { key } of [ ...MACROS, ...VITAMINS_MINERALS ] ) {
		values[ key ] =
			food?.[ key ] !== undefined ? String( food[ key ] ) : '';
	}

	return values;
}

interface CustomFoodFormProps {
	food?: CustomFood | null;
	onSubmit: ( data: CustomFoodInput ) => Promise< void >;
	onCancel: () => void;
	onDirtyChange?: ( isDirty: boolean ) => void;
}

// Shared create/edit form for a hand-entered food — the manual-entry
// counterpart to picking a food from USDA search. Every nutrient field
// is optional; a blank field is stored as "not entered", not zero (see
// CustomFoodNutrientMap on the backend).
export default function CustomFoodForm( {
	food,
	onSubmit,
	onCancel,
	onDirtyChange,
}: CustomFoodFormProps ) {
	const [ values, setValues ] = useState< FormValues >( () =>
		toFormValues( food )
	);
	const [ isSaving, setIsSaving ] = useState( false );
	const { isDirty, markClean } = useGlobalDirtyState( values );

	useEffect( () => {
		onDirtyChange?.( isDirty );
	}, [ isDirty, onDirtyChange ] );

	const setField =
		( field: string ) => ( event: React.ChangeEvent< HTMLInputElement > ) =>
			setValues( ( prev ) => ( {
				...prev,
				[ field ]: event.target.value,
			} ) );

	const handleSubmit = async ( event: React.FormEvent ) => {
		event.preventDefault();
		setIsSaving( true );

		try {
			const data: Record< string, string | number > = {
				name: values.name,
			};

			for ( const { key } of [ ...MACROS, ...VITAMINS_MINERALS ] ) {
				if ( values[ key ] !== '' ) {
					data[ key ] = Number( values[ key ] );
				}
			}

			await onSubmit( data as unknown as CustomFoodInput );
			markClean();
		} catch ( error ) {
			toast.error(
				errorMessage(
					error,
					__( 'Something went wrong saving this food.', 'merodiet' )
				)
			);
		} finally {
			setIsSaving( false );
		}
	};

	const handleCancel = async () => {
		if (
			! isDirty ||
			( await confirmDialog( {
				message: __( 'Discard unsaved changes?', 'merodiet' ),
				confirmLabel: __( 'Discard', 'merodiet' ),
				destructive: true,
			} ) )
		) {
			onCancel();
		}
	};

	return (
		<form
			onSubmit={ handleSubmit }
			style={ { display: 'flex', flexDirection: 'column', gap: '16px' } }
		>
			<div className="merodiet-field">
				<label htmlFor="merodiet-food-name">
					{ __( 'Food name', 'merodiet' ) }
					<span
						style={ { color: 'var(--critical)' } }
						aria-hidden="true"
					>
						{ ' *' }
					</span>
				</label>
				<input
					id="merodiet-food-name"
					type="text"
					value={ values.name }
					onChange={ setField( 'name' ) }
					placeholder={ __(
						"Client's branded protein shake",
						'merodiet'
					) }
					required
				/>
			</div>

			<div>
				<h4 style={ { margin: '0 0 8px' } }>
					{ __( 'Macros (per 100g)', 'merodiet' ) }
				</h4>
				<NutrientGrid
					fields={ MACROS }
					values={ values }
					setField={ setField }
				/>
			</div>

			<div>
				<h4 style={ { margin: '0 0 8px' } }>
					{ __( 'Vitamins & minerals (per 100g)', 'merodiet' ) }
				</h4>
				<NutrientGrid
					fields={ VITAMINS_MINERALS }
					values={ values }
					setField={ setField }
				/>
			</div>

			{ isDirty && <UnsavedBadge /> }

			<div style={ { display: 'flex', gap: '10px' } }>
				<Button
					variant="primary"
					type="submit"
					disabled={ isSaving }
					style={ { flex: 1, justifyContent: 'center' } }
				>
					{ food
						? __( 'Save changes', 'merodiet' )
						: __( 'Add custom food', 'merodiet' ) }
				</Button>
				<Button
					variant="ghost"
					type="button"
					onClick={ handleCancel }
					disabled={ isSaving }
				>
					{ __( 'Cancel', 'merodiet' ) }
				</Button>
			</div>
		</form>
	);
}

interface NutrientGridProps {
	fields: NutrientFieldDef[];
	values: FormValues;
	setField: (
		field: string
	) => ( event: React.ChangeEvent< HTMLInputElement > ) => void;
}

function NutrientGrid( { fields, values, setField }: NutrientGridProps ) {
	return (
		<div
			style={ {
				display: 'grid',
				gridTemplateColumns: '1fr 1fr',
				gap: '12px',
			} }
		>
			{ fields.map( ( { key, label, unit } ) => (
				<div className="merodiet-field" key={ key }>
					<label htmlFor={ `merodiet-food-${ key }` }>
						{ label }{ ' ' }
						<span style={ { color: 'var(--ink-faint)' } }>
							({ unit })
						</span>
					</label>
					<input
						id={ `merodiet-food-${ key }` }
						type="number"
						step="any"
						min="0"
						value={ values[ key ] }
						onChange={ setField( key ) }
					/>
				</div>
			) ) }
		</div>
	);
}
