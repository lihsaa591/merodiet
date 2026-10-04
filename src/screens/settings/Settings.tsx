import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import Panel, { PanelBody, PanelHead } from '../../components/ui/Panel';
import Button from '../../components/ui/Button';
import EmailTab from './EmailTab';
import { errorMessage, toast } from '../../utils/toast';
import styles from './Settings.module.css';

interface UsdaKeyState {
	is_set: boolean;
	masked: string | null;
}

interface DataRetentionState {
	delete_on_uninstall: boolean;
}

type SettingsTab = 'general' | 'email';

export default function Settings() {
	const [ activeTab, setActiveTab ] = useState< SettingsTab >( 'general' );
	const [ keyState, setKeyState ] = useState< UsdaKeyState | null >( null );
	const [ isReplacing, setIsReplacing ] = useState( false );
	const [ apiKeyInput, setApiKeyInput ] = useState( '' );
	const [ isSaving, setIsSaving ] = useState( false );
	const [ retention, setRetention ] = useState< DataRetentionState | null >(
		null
	);
	const [ isSavingRetention, setIsSavingRetention ] = useState( false );

	useEffect( () => {
		apiFetch< DataRetentionState >( {
			path: '/nutrio/v1/settings/data-retention',
		} ).then( setRetention );
	}, [] );

	const handleRetentionChange = async ( deleteOnUninstall: boolean ) => {
		setIsSavingRetention( true );

		try {
			const result = await apiFetch< DataRetentionState >( {
				path: '/nutrio/v1/settings/data-retention',
				method: 'PUT',
				data: { delete_on_uninstall: deleteOnUninstall },
			} );

			setRetention( result );
			toast.success( __( 'Data setting saved.', 'nutrio' ) );
		} catch ( error ) {
			toast.error(
				errorMessage(
					error,
					__( 'Could not save the data setting.', 'nutrio' )
				)
			);
		} finally {
			setIsSavingRetention( false );
		}
	};

	useEffect( () => {
		apiFetch< UsdaKeyState >( {
			path: '/nutrio/v1/settings/usda-key',
		} ).then( setKeyState );
	}, [] );

	const handleSave = async ( event: React.FormEvent ) => {
		event.preventDefault();
		setIsSaving( true );

		try {
			const result = await apiFetch< UsdaKeyState >( {
				path: '/nutrio/v1/settings/usda-key',
				method: 'PUT',
				data: { api_key: apiKeyInput },
			} );

			setKeyState( result );
			setIsReplacing( false );
			setApiKeyInput( '' );
			toast.success( __( 'USDA API key saved.', 'nutrio' ) );
		} catch ( error ) {
			toast.error(
				errorMessage(
					error,
					__( 'Could not save the USDA API key.', 'nutrio' )
				)
			);
		} finally {
			setIsSaving( false );
		}
	};

	return (
		<>
			<div className="nutrio-topbar">
				<h1>{ __( 'Settings', 'nutrio' ) }</h1>
			</div>

			<div className={ styles.tabs }>
				<button
					className={ `${ styles.tab } ${
						'general' === activeTab ? styles.isActive : ''
					}` }
					onClick={ () => setActiveTab( 'general' ) }
				>
					{ __( 'General', 'nutrio' ) }
				</button>
				<button
					className={ `${ styles.tab } ${
						'email' === activeTab ? styles.isActive : ''
					}` }
					onClick={ () => setActiveTab( 'email' ) }
				>
					{ __( 'Email', 'nutrio' ) }
				</button>
			</div>

			{ 'general' === activeTab && (
				<Panel>
					<PanelHead>
						<h3>{ __( 'USDA FoodData Central', 'nutrio' ) }</h3>
					</PanelHead>
					<PanelBody>
						<p
							style={ {
								color: 'var(--ink-muted)',
								marginTop: 0,
							} }
						>
							{ __(
								'Required for recipe and plan building — this key lets Nutrio search and pull nutrient data from the USDA FoodData Central database. Get a free key at api.data.gov/signup.',
								'nutrio'
							) }
						</p>

						{ null === keyState && (
							<p>{ __( 'Loading…', 'nutrio' ) }</p>
						) }

						{ null !== keyState && ! isReplacing && (
							<div
								style={ {
									display: 'flex',
									alignItems: 'center',
									gap: '12px',
								} }
							>
								{ keyState.is_set ? (
									<span className="nutrio-mono">
										{ keyState.masked }
									</span>
								) : (
									<span
										style={ { color: 'var(--ink-muted)' } }
									>
										{ __( 'No key set', 'nutrio' ) }
									</span>
								) }
								<Button
									variant="ghost"
									onClick={ () => setIsReplacing( true ) }
								>
									{ keyState.is_set
										? __( 'Replace key', 'nutrio' )
										: __( 'Add key', 'nutrio' ) }
								</Button>
							</div>
						) }

						{ null !== keyState && isReplacing && (
							<form
								onSubmit={ handleSave }
								style={ {
									display: 'flex',
									gap: '10px',
									alignItems: 'flex-end',
								} }
							>
								<div
									className="nutrio-field"
									style={ { flex: 1, marginBottom: 0 } }
								>
									<label htmlFor="nutrio-usda-key">
										{ __( 'USDA API key', 'nutrio' ) }
									</label>
									<input
										id="nutrio-usda-key"
										type="text"
										value={ apiKeyInput }
										onChange={ ( event ) =>
											setApiKeyInput( event.target.value )
										}
										required
									/>
								</div>
								<Button
									variant="primary"
									type="submit"
									disabled={ isSaving }
								>
									{ __( 'Save', 'nutrio' ) }
								</Button>
								<Button
									variant="ghost"
									type="button"
									disabled={ isSaving }
									onClick={ () => {
										setIsReplacing( false );
										setApiKeyInput( '' );
									} }
								>
									{ __( 'Cancel', 'nutrio' ) }
								</Button>
							</form>
						) }
					</PanelBody>
				</Panel>
			) }

			{ 'general' === activeTab && (
				<Panel>
					<PanelHead>
						<h3>{ __( 'Data on uninstall', 'nutrio' ) }</h3>
					</PanelHead>
					<PanelBody>
						<p
							style={ {
								color: 'var(--ink-muted)',
								marginTop: 0,
							} }
						>
							{ __(
								'By default your clients, plans, logs and measurements are kept when you delete the plugin. Turn this on to permanently remove all Nutrio data when the plugin is deleted.',
								'nutrio'
							) }
						</p>
						<label
							htmlFor="nutrio-delete-on-uninstall"
							style={ {
								display: 'flex',
								alignItems: 'center',
								gap: '8px',
							} }
						>
							<input
								id="nutrio-delete-on-uninstall"
								type="checkbox"
								checked={ !! retention?.delete_on_uninstall }
								disabled={
									null === retention || isSavingRetention
								}
								onChange={ ( event ) =>
									handleRetentionChange(
										event.target.checked
									)
								}
							/>
							{ __(
								'Delete all Nutrio data when the plugin is deleted',
								'nutrio'
							) }
						</label>
					</PanelBody>
				</Panel>
			) }

			{ 'email' === activeTab && <EmailTab /> }
		</>
	);
}
