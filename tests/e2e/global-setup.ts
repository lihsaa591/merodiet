import { fileURLToPath } from 'node:url';
import { chromium, request as playwrightRequest } from '@playwright/test';
import { RequestUtils } from '@wordpress/e2e-test-utils-playwright';
import { runWpCli } from './helpers/wp-cli';

const CLIENT_EMAIL = 'e2e-client@example.test';
const CLIENT_LOGIN = 'e2e-client';
const CLIENT_PASSWORD = 'E2eTest123!';
const SEED_FOOD_SOURCE_ID = 999999001;

async function globalSetup(): Promise< void > {
	const requestUtils = await RequestUtils.setup( {
		baseURL: 'http://localhost:8888',
	} );

	// Idempotency: if a previous run already seeded this client, skip
	// straight to done rather than erroring on a duplicate email/user.
	const existingUsers = await requestUtils.rest( {
		path: '/wp/v2/users',
		params: { search: CLIENT_EMAIL, context: 'edit' },
	} );

	if ( Array.isArray( existingUsers ) && existingUsers.length > 0 ) {
		return;
	}

	// 1. Insert one locally-cached food row directly via WP-CLI — this
	// is the one thing REST can't do standalone; the only food-creating
	// route resolves live against the USDA API, which would make this
	// seed step network-dependent and flaky in CI.
	const nowSql = new Date().toISOString().slice( 0, 19 ).replace( 'T', ' ' );
	const nutrientsJson = JSON.stringify( {
		'1008': { name: 'Energy', unit: 'kcal', amount_per_100g: 200 },
		'1003': { name: 'Protein', unit: 'g', amount_per_100g: 10 },
		'1005': { name: 'Carbohydrate', unit: 'g', amount_per_100g: 20 },
		'1004': { name: 'Total lipid (fat)', unit: 'g', amount_per_100g: 5 },
	} );

	// The nutrients JSON's own quotes can't survive being embedded in a
	// double-quoted `wp db query` argument that itself goes through a
	// shell (runWpCli's execSync runs the whole command through `sh -c`,
	// so nested quoting breaks the argument apart). Base64-encoding the
	// SQL and decoding it inside a `wp eval` sidesteps quoting entirely,
	// since base64 never contains a shell- or SQL-meaningful character.
	const insertSql =
		`INSERT INTO wp_nutrio_foods (source, source_id, description, data_type, nutrients, source_synced_at, created_at, updated_at) VALUES ('usda', ${ SEED_FOOD_SOURCE_ID }, 'E2E Seed Oatmeal', 'Foundation', '${ nutrientsJson.replace( /'/g, "\\'" ) }', '${ nowSql }', '${ nowSql }', '${ nowSql }')`;
	const insertSqlBase64 = Buffer.from( insertSql, 'utf8' ).toString( 'base64' );

	runWpCli(
		`eval 'global $wpdb; $wpdb->query( base64_decode( "${ insertSqlBase64 }" ) );'`
	);
	const foodId = runWpCli(
		`db query "SELECT id FROM wp_nutrio_foods WHERE source_id=${ SEED_FOOD_SOURCE_ID }" --skip-column-names`
	);

	// 2. Create the client record (as the practitioner — wp-env's default
	// admin already has every practitioner capability, see
	// includes/Roles/RoleRegistrar.php).
	const client = await requestUtils.rest( {
		path: '/nutrio/v1/clients',
		method: 'POST',
		data: {
			first_name: 'E2E',
			last_name: 'Client',
			email: CLIENT_EMAIL,
		},
	} );

	// 3. Invite — this creates the linked WP user (role nutrition_client)
	// and emails a random-password reset link we don't need. The user is
	// provisioned (and the client row's user_id set) before that email is
	// attempted, so a `retrieve_password_email_failure` here — expected in
	// wp-env, which has no outgoing-mail transport — still leaves the user
	// created; only re-throw anything that isn't that specific, tolerable
	// failure.
	try {
		await requestUtils.rest( {
			path: `/nutrio/v1/clients/${ client.id }/invite`,
			method: 'POST',
		} );
	} catch ( error ) {
		const code = ( error as { code?: string } )?.code;

		if ( 'retrieve_password_email_failure' !== code ) {
			throw error;
		}
	}

	// 4. Find that just-created user and give it a known, deterministic
	// test password + login so the client-portal fixture can log in.
	const [ createdUser ] = await requestUtils.rest( {
		path: '/wp/v2/users',
		params: { search: CLIENT_EMAIL, context: 'edit' },
	} );

	// `user_login` is intentionally immutable through WP core's own APIs
	// (REST and wp_update_user() both reject it — "Username is not
	// editable"), so the only way to land the exact deterministic login
	// Task 3's fixture hard-codes is a direct DB update; `password` (a
	// virtual field, not a real column) *is* REST-editable and goes
	// through the normal REST call.
	runWpCli(
		`db query "UPDATE wp_users SET user_login='${ CLIENT_LOGIN }' WHERE ID=${ createdUser.id }"`
	);

	await requestUtils.rest( {
		path: `/wp/v2/users/${ createdUser.id }`,
		method: 'POST',
		data: { password: CLIENT_PASSWORD },
	} );

	// 5. Assign a plan covering today, so Plan/Log/Dashboard render a
	// populated day instead of an empty state.
	const today = new Date().toISOString().slice( 0, 10 );
	const plan = await requestUtils.rest( {
		path: '/nutrio/v1/plans',
		method: 'POST',
		data: {
			title: 'E2E Seed Plan',
			start_date: today,
			end_date: today,
			days: [
				{
					day_offset: 0,
					items: [
						{
							meal_type: 'breakfast',
							food_id: Number( foodId ),
							quantity_grams: 150,
						},
					],
				},
			],
		},
	} );

	await requestUtils.rest( {
		path: `/nutrio/v1/plans/${ plan.id }/assign`,
		method: 'POST',
		data: { client_id: client.id, start_date: today, end_date: today },
	} );

	// 6. Log one measurement — /me/measurements is self-only, so this
	// needs an actual authenticated client-portal session, not the
	// admin-authenticated requestUtils above.
	const browser = await chromium.launch();
	const page = await browser.newPage();
	await page.goto( 'http://localhost:8888/client-portal/' );
	await page.fill( '#user_login', CLIENT_LOGIN );
	await page.fill( '#user_pass', CLIENT_PASSWORD );
	await page.click( '#wp-submit' );
	await page.waitForSelector( '.nutrio-rail' );

	const restNonce = await page.evaluate(
		() => ( window as unknown as { nutrioClientPortal: { restNonce: string } } )
			.nutrioClientPortal.restNonce
	);

	const clientRequest = await playwrightRequest.newContext( {
		baseURL: 'http://localhost:8888',
		storageState: await page.context().storageState(),
	} );

	await clientRequest.post( '/wp-json/nutrio/v1/me/measurements', {
		headers: { 'X-WP-Nonce': restNonce },
		data: { measured_at: today, weight_grams: 75000 },
	} );

	await clientRequest.dispose();
	await browser.close();
}

// Playwright imports this module and invokes the default export itself.
// Support running the same file standalone too (`npx tsx
// tests/e2e/global-setup.ts`), which is how the manual verification
// steps and the CI job in Task 6 exercise it outside of a full
// Playwright run.
if ( process.argv[ 1 ] === fileURLToPath( import.meta.url ) ) {
	globalSetup().catch( ( error ) => {
		console.error( error );
		process.exitCode = 1;
	} );
}

export default globalSetup;
