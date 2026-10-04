import { useId } from 'react';
import styles from './Switch.module.css';

interface SwitchProps {
	checked: boolean;
	onChange: ( checked: boolean ) => void;
	disabled?: boolean;
	label?: string;
}

// A small on/off pill switch — the shared control for every
// enable/disable toggle in the app, so a checkbox doesn't have to
// double as a switch anywhere.
export default function Switch( {
	checked,
	onChange,
	disabled,
	label,
}: SwitchProps ) {
	const inputId = useId();

	return (
		<label className={ styles.switch } htmlFor={ inputId }>
			<input
				id={ inputId }
				type="checkbox"
				checked={ checked }
				disabled={ disabled }
				onChange={ ( event ) => onChange( event.target.checked ) }
			/>
			<span className={ styles.track }>
				<span className={ styles.thumb } />
			</span>
			{ label && <span className={ styles.label }>{ label }</span> }
		</label>
	);
}
