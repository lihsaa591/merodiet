import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import type { Plan } from '../types';
import styles from './PlanTab.module.css';

export default function PlanTab() {
	const [ plan, setPlan ] = useState< Plan | null | undefined >( undefined );

	useEffect( () => {
		apiFetch< Plan | null >( { path: '/nutrio/v1/me/plan' } ).then(
			setPlan,
			() => setPlan( null )
		);
	}, [] );

	if ( undefined === plan ) {
		return <p>{ __( 'Loading…', 'nutrio' ) }</p>;
	}

	if ( null === plan ) {
		return (
			<p className={ styles.empty }>
				{ __(
					'No plan assigned yet — check back once your practitioner assigns one.',
					'nutrio'
				) }
			</p>
		);
	}

	return (
		<div>
			<h2 className={ styles.planTitle }>{ plan.title }</h2>
			<p className={ styles.dateRange }>
				{ plan.start_date } – { plan.end_date }
			</p>
			{ plan.days.map( ( day ) => (
				<div key={ day.day_offset } className={ styles.day }>
					<h3 className={ styles.dayTitle }>
						{ __( 'Day', 'nutrio' ) } { day.day_offset + 1 }
					</h3>
					<ul className={ styles.itemList }>
						{ day.items.map( ( item ) => (
							<li key={ item.id } className={ styles.item }>
								<span className={ styles.mealType }>
									{ item.meal_type }
								</span>
								{ ' — ' }
								{ item.food_description ??
									item.recipe_name ??
									__( 'Item', 'nutrio' ) }
							</li>
						) ) }
					</ul>
				</div>
			) ) }
		</div>
	);
}
