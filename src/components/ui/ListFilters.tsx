import { useEffect, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import styles from './ListFilters.module.css';

const DEBOUNCE_MS = 400;

export interface StatusFilterOption {
	value: string;
	label: string;
}

interface ListFiltersProps {
	search: string;
	onSearchChange: ( value: string ) => void;
	searchPlaceholder?: string;
	/** Omit entirely for a screen with no status concept (Recipes, Custom foods). The first option should be value: '' ("All statuses"). */
	status?: string;
	onStatusChange?: ( value: string ) => void;
	statusOptions?: StatusFilterOption[];
}

// Shared search(+status) bar for any list screen — see usePagination for
// how the values this drives end up synced to the URL. The search box
// debounces locally before calling onSearchChange, so typing doesn't fire
// a server request (and a URL history entry) per keystroke; status changes
// apply immediately since a select only fires on an already-deliberate
// choice.
export default function ListFilters( {
	search,
	onSearchChange,
	searchPlaceholder,
	status,
	onStatusChange,
	statusOptions,
}: ListFiltersProps ) {
	const [ localSearch, setLocalSearch ] = useState( search );
	const debounceRef = useRef< ReturnType< typeof setTimeout > >();

	// Stay in sync if the filter changes from outside this component (e.g.
	// browser back/forward restoring a different URL state).
	useEffect( () => {
		setLocalSearch( search );
	}, [ search ] );

	const handleSearchChange = (
		event: React.ChangeEvent< HTMLInputElement >
	) => {
		const value = event.target.value;
		setLocalSearch( value );

		clearTimeout( debounceRef.current );
		debounceRef.current = setTimeout(
			() => onSearchChange( value ),
			DEBOUNCE_MS
		);
	};

	const hasStatusFilter =
		undefined !== status &&
		onStatusChange &&
		statusOptions &&
		statusOptions.length > 0;

	return (
		<div className={ styles.bar }>
			<div className={ styles.searchWrap }>
				<div className="merodiet-field">
					<input
						type="text"
						value={ localSearch }
						onChange={ handleSearchChange }
						placeholder={
							searchPlaceholder ?? __( 'Search…', 'merodiet' )
						}
					/>
				</div>
			</div>
			{ hasStatusFilter && (
				<div className={ styles.statusWrap }>
					<div className="merodiet-field">
						<select
							value={ status }
							onChange={ ( event ) =>
								onStatusChange( event.target.value )
							}
						>
							{ statusOptions.map( ( option ) => (
								<option
									key={ option.value }
									value={ option.value }
								>
									{ option.label }
								</option>
							) ) }
						</select>
					</div>
				</div>
			) }
		</div>
	);
}
