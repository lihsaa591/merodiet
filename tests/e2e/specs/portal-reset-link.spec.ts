import { test, expect } from '../fixtures/admin-session';
import { runWpCli } from '../helpers/wp-cli';

// A reset link is authorised by its key alone — it must reach the form
// even when the browser already holds a different session (here: the
// practitioner who just invited the client and opens the email on the
// same machine), instead of bouncing to wp-admin.
test( 'a client reset link works while logged in as someone else', async ( {
	adminPage,
} ) => {
	const key = runWpCli(
		`eval 'echo get_password_reset_key( get_user_by( "login", "e2e-client" ) );'`
	);

	await adminPage.goto(
		`/client-portal/?merodiet_action=resetpass&key=${ key }&login=e2e-client`
	);

	await expect(
		adminPage.locator( 'form[name="resetpassform"]' )
	).toBeVisible();
	await expect( adminPage ).not.toHaveURL( /wp-admin/ );
} );
