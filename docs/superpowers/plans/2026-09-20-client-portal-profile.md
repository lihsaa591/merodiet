# Client-Portal Profile (Avatar, Self-Service Edit, Password Change) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a client view and edit their own profile (name, email, goals, dietary restrictions, allergies, avatar photo) and change their own password, from a Drawer opened by clicking their name in the client-portal sidebar footer.

**Architecture:** A new `GET /me/profile` + `PATCH /me/profile` pair on `MeController` reuse the existing `ClientRepository::update()` write path (extended with an `avatar_id` field); a separate `POST /me/profile/avatar` route handles the file upload via WordPress's own `media_handle_upload()`; a separate `POST /me/password` route calls `wp_set_password()` for the current user only, then re-authenticates them (WordPress clears the auth cookie when you change your own password). On the frontend, a `ProfileDrawer` (mirroring the practitioner side's `ClientForm`/`Drawer` pattern) holds the editable fields and avatar upload, with a "Change password" row at the bottom opening a separate `PasswordChangeModal`.

**Tech Stack:** PHP 8.1, WordPress core media/user APIs (`media_handle_upload()`, `wp_set_password()`, `wp_signon()`), React (`@wordpress/element`, `@wordpress/api-fetch`), the existing `Drawer`/`Button`/`Panel` components, PHPUnit + Brain Monkey.

**Spec:** Design approved in chat (this session) — no separate spec document; this plan is the record of what was agreed.

## Global Constraints

- **Pre-ship migration policy (MeroDiet-specific, temporary):** since this plugin has not shipped to any external site yet, edit the existing `database/migrations/2026_09_08_000000_create_clients_table.php` migration directly to add the new column — do NOT create a new migration file for it. After editing, the user's own local dev database (which already ran the original migration) needs the equivalent `ALTER TABLE` run once via WP-CLI, since editing the file alone doesn't retroactively re-run it — see Task 1.
- Every REST route must pass an explicit `required_capability` — for every route in this plan, that's `'view_own_merodiet_plan'` (all routes live on `MeController`, which already enforces this via `AbstractClientController`).
- No route may accept a client identifier from the request — identity is always resolved via `current_client_id()` (already established pattern).
- Every user-facing string goes through `__( '...', 'merodiet' )` (PHP) / `__( '...', 'merodiet' )` from `@wordpress/i18n` (JS).
- `composer test`, `vendor/bin/phpcs`, `vendor/bin/phpstan analyse`, `npm run check-types`, `npx wp-scripts lint-js`, `npm run build` must all stay green after every task.
- Commit style: `feat: ...` subject, trailer EXACTLY `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Work happens directly in `/Users/aashilbijukshe/merodiet` (no worktree) — this is also the user's live Local-by-Flywheel site's plugin directory (a symlink), so every change here is immediately testable on their actual site once rebuilt.

---

### Task 1: `avatar_id` column + `ClientRepository` support

**Files:**
- Modify: `database/migrations/2026_09_08_000000_create_clients_table.php`
- Modify: `includes/Repositories/ClientRepository.php`

**Interfaces:**
- Produces: `avatar_id` column on `wp_merodiet_clients`; `ClientRepository::update()` accepts an `avatar_id` key in its `$data` array; `ClientRepository::hydrate()` (private, but its output shape matters) adds `avatar_url: string|null` to every returned client row, computed from `avatar_id` via `wp_get_attachment_url()`.

- [ ] **Step 1: Edit the migration**

Read `database/migrations/2026_09_08_000000_create_clients_table.php` first. Add `avatar_id BIGINT UNSIGNED NULL` to the `CREATE TABLE` statement, right after the `user_id` column, and add a `KEY avatar_id (avatar_id)` alongside the existing keys:

```php
"CREATE TABLE {$table} (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    practitioner_user_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NULL,
    avatar_id BIGINT UNSIGNED NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(191) NOT NULL,
    goals TEXT NULL,
    dietary_restrictions TEXT NULL,
    allergies TEXT NULL COMMENT 'JSON array of free-text allergen strings',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY  (id),
    KEY practitioner_user_id (practitioner_user_id),
    KEY user_id (user_id),
    KEY avatar_id (avatar_id)
) {$charset_collate};"
```

Also update the class docblock's second paragraph (the one starting "`user_id` is nullable...") to add one sentence noting `avatar_id` is nullable the same way, pointing at a WordPress media attachment the client uploaded via the portal — keep it as terse as the existing docblock style.

- [ ] **Step 2: Sync the user's local database**

This column needs to exist on the user's already-created local table. Run (adjust the socket path if it differs from earlier in this project — check for the Local by Flywheel MySQL socket under `~/Library/Application Support/Local/run/*/mysql/mysqld.sock` if this exact one doesn't exist):

```bash
SOCK="/Users/aashilbijukshe/Library/Application Support/Local/run/DSWlm2MkK/mysql/mysqld.sock"
php -d mysqli.default_socket="$SOCK" -d pdo_mysql.default_socket="$SOCK" $(which wp) db query "ALTER TABLE wp_merodiet_clients ADD COLUMN avatar_id BIGINT UNSIGNED NULL AFTER user_id, ADD KEY avatar_id (avatar_id);" --path=$(find "/Users/aashilbijukshe/Local Sites" -maxdepth 4 -type d -name "public" | head -1)
```

If the socket path or `wp` install path has changed since this was last used, find them fresh: `find "/Users/aashilbijukshe/Library/Application Support/Local/run" -name "mysqld.sock" 2>/dev/null` and `find "/Users/aashilbijukshe/Local Sites" -maxdepth 2 -type d`.

Verify it worked: `wp db query "DESCRIBE wp_merodiet_clients;"` (with the same socket override) should list `avatar_id`.

- [ ] **Step 3: Update `ClientRepository`**

Read `includes/Repositories/ClientRepository.php` first. In `update()`, add `'avatar_id'` to the field whitelist array (the one currently containing `'first_name', 'last_name', 'email', 'goals', 'dietary_restrictions', 'status'`):

```php
foreach ( array( 'first_name', 'last_name', 'email', 'goals', 'dietary_restrictions', 'status', 'avatar_id' ) as $field ) {
    if ( array_key_exists( $field, $data ) ) {
        $fields[ $field ] = $data[ $field ];
    }
}
```

In the private `hydrate()` method, add two lines after the existing `$row['user_id']` line:

```php
$row['avatar_id']  = null === $row['avatar_id'] ? null : (int) $row['avatar_id'];
$row['avatar_url'] = null === $row['avatar_id'] ? null : wp_get_attachment_url( (int) $row['avatar_id'] );
```

- [ ] **Step 4: Verify**

Run: `php -l database/migrations/2026_09_08_000000_create_clients_table.php && php -l includes/Repositories/ClientRepository.php && vendor/bin/phpcs database/migrations/2026_09_08_000000_create_clients_table.php includes/Repositories/ClientRepository.php && vendor/bin/phpstan analyse includes/Repositories/ClientRepository.php && composer test`
Expected: no errors, all tests still passing (this file has no dedicated test suite, per this codebase's established convention that repositories aren't unit-tested against a real database).

- [ ] **Step 5: Commit**

```bash
git add database/migrations/2026_09_08_000000_create_clients_table.php includes/Repositories/ClientRepository.php
git commit -m "$(cat <<'EOF'
feat: add avatar_id to the clients table and repository

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `GET /me/profile` + `PATCH /me/profile`

**Files:**
- Modify: `includes/RestApi/MeController.php`
- Modify: `tests/Unit/RestApi/ControllerCapabilitiesTest.php`

**Interfaces:**
- Consumes: `ClientRepository::find_for_user()` (existing), `ClientRepository::update()` (Task 1's extended version).
- Produces: `GET /merodiet/v1/me/profile` (returns the caller's own hydrated client row), `PATCH /merodiet/v1/me/profile` (accepts `first_name`, `last_name`, `email`, `goals`, `dietary_restrictions`, `allergies`).

- [ ] **Step 1: Read `MeController.php` first**, to see the exact existing route-registration and handler patterns (`get_plan()`, `list_logs()` etc.) this task must match.

- [ ] **Step 2: Add the two routes** to `register_routes()`, alongside the existing ones:

```php
$this->register_route(
    '/profile',
    array(
        'methods'  => WP_REST_Server::READABLE,
        'callback' => array( $this, 'get_profile' ),
    ),
    required_capability: 'view_own_merodiet_plan'
);

$this->register_route(
    '/profile',
    array(
        'methods'  => WP_REST_Server::EDITABLE,
        'callback' => array( $this, 'update_profile' ),
        'args'     => self::profile_write_args(),
    ),
    required_capability: 'view_own_merodiet_plan'
);
```

- [ ] **Step 3: Add the two handler methods and the arg-schema helper**, matching the existing methods' shape exactly:

```php
/**
 * GET /me/profile — the caller's own client record.
 *
 * @param WP_REST_Request $request The current request.
 */
public function get_profile( WP_REST_Request $request ): WP_REST_Response|WP_Error {
    $client_id = $this->current_client_id();

    if ( $client_id instanceof WP_Error ) {
        return $client_id;
    }

    return $this->success( $this->clients->find( $client_id ) );
}

/**
 * PATCH /me/profile — update the caller's own client record.
 *
 * @param WP_REST_Request $request The current request.
 */
public function update_profile( WP_REST_Request $request ): WP_REST_Response|WP_Error {
    $client_id = $this->current_client_id();

    if ( $client_id instanceof WP_Error ) {
        return $client_id;
    }

    $data = array();

    foreach ( array( 'first_name', 'last_name', 'email', 'goals', 'dietary_restrictions', 'allergies' ) as $field ) {
        if ( null !== $request->get_param( $field ) ) {
            $data[ $field ] = $request->get_param( $field );
        }
    }

    $this->clients->update( $client_id, $data );

    return $this->success( $this->clients->find( $client_id ) );
}
```

Add this private static method near the existing `log_write_args()`/`measurement_write_args()`:

```php
/**
 * REST arg schema for PATCH /me/profile.
 *
 * @return array<string, array<string, mixed>>
 */
private static function profile_write_args(): array {
    return array(
        'first_name'           => array(
            'type'              => 'string',
            'sanitize_callback' => 'sanitize_text_field',
        ),
        'last_name'            => array(
            'type'              => 'string',
            'sanitize_callback' => 'sanitize_text_field',
        ),
        'email'                => array(
            'type'              => 'string',
            'format'            => 'email',
            'sanitize_callback' => 'sanitize_email',
        ),
        'goals'                => array(
            'type'              => 'string',
            'sanitize_callback' => 'sanitize_textarea_field',
        ),
        'dietary_restrictions' => array(
            'type'              => 'string',
            'sanitize_callback' => 'sanitize_textarea_field',
        ),
        'allergies'            => array(
            'type'  => 'array',
            'items' => array( 'type' => 'string' ),
        ),
    );
}
```

`$this->clients` already exists as a constructor property (it's the same `ClientRepository` instance `client_repository()` returns) — no constructor change needed.

- [ ] **Step 4: Update `ControllerCapabilitiesTest`'s `MeController` row is unaffected** — the existing dataProvider entry already covers "every route on this controller", so no test file change is needed for the capability check itself. Just run it to confirm the two new routes pass:

Run: `composer test -- --filter ControllerCapabilitiesTest`
Expected: PASS (the existing `MeController` row's assertion now also covers these 2 new routes automatically, since it iterates every registered route).

- [ ] **Step 5: Verify**

Run: `php -l includes/RestApi/MeController.php && vendor/bin/phpcs includes/RestApi/MeController.php && vendor/bin/phpstan analyse includes/RestApi/MeController.php && composer test`
Expected: no errors, full suite green.

- [ ] **Step 6: Commit**

```bash
git add includes/RestApi/MeController.php
git commit -m "$(cat <<'EOF'
feat: add GET/PATCH /me/profile for client self-service profile edits

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `POST /me/profile/avatar`

**Files:**
- Modify: `includes/RestApi/MeController.php`

**Interfaces:**
- Consumes: `ClientRepository::update()` (Task 1).
- Produces: `POST /merodiet/v1/me/profile/avatar` — accepts a single uploaded file under the `avatar` field name, returns the updated client row (with the new `avatar_url`).

- [ ] **Step 1: Add the route**, after the profile routes:

```php
$this->register_route(
    '/profile/avatar',
    array(
        'methods'  => WP_REST_Server::CREATABLE,
        'callback' => array( $this, 'upload_avatar' ),
    ),
    required_capability: 'view_own_merodiet_plan'
);
```

- [ ] **Step 2: Add the handler**, using WordPress core's own upload pipeline (`media_handle_upload()` — the same function core itself uses for the media library, so file-type/size validation, thumbnail generation, and attachment creation are all handled by code that's already battle-tested):

```php
/**
 * POST /me/profile/avatar — upload a new avatar image for the caller.
 * Requires the 'avatar' field in a multipart/form-data request.
 *
 * @param WP_REST_Request $request The current request.
 */
public function upload_avatar( WP_REST_Request $request ): WP_REST_Response|WP_Error {
    $client_id = $this->current_client_id();

    if ( $client_id instanceof WP_Error ) {
        return $client_id;
    }

    $files = $request->get_file_params();

    if ( empty( $files['avatar'] ) ) {
        return $this->error( 'merodiet_missing_file', __( 'No image file was uploaded.', 'merodiet' ), 400 );
    }

    if ( ! function_exists( 'media_handle_upload' ) ) {
        require_once ABSPATH . 'wp-admin/includes/image.php';
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
    }

    $allowed_types = array( 'image/jpeg', 'image/png', 'image/webp' );

    if ( ! in_array( $files['avatar']['type'], $allowed_types, true ) ) {
        return $this->error( 'merodiet_invalid_file_type', __( 'Please upload a JPEG, PNG, or WebP image.', 'merodiet' ), 400 );
    }

    $attachment_id = media_handle_upload( 'avatar', 0 );

    if ( is_wp_error( $attachment_id ) ) {
        return $attachment_id;
    }

    $this->clients->update( $client_id, array( 'avatar_id' => $attachment_id ) );

    return $this->success( $this->clients->find( $client_id ) );
}
```

Note: `media_handle_upload()` reads directly from PHP's own `$_FILES` superglobal (it's a WordPress core admin function, not REST-aware) — `$request->get_file_params()` is only used here to check whether a file was sent at all before calling it; `media_handle_upload()` itself will independently re-read `$_FILES['avatar']`, which is safe since both read the same underlying request.

- [ ] **Step 3: Verify**

Run: `php -l includes/RestApi/MeController.php && vendor/bin/phpcs includes/RestApi/MeController.php && vendor/bin/phpstan analyse includes/RestApi/MeController.php && composer test`
Expected: no errors, full suite green. (No new unit test — file upload handling depends on PHP's `$_FILES` superglobal and WordPress's filesystem APIs, neither of which this codebase's pure Brain-Monkey suite can exercise; this matches the same "not everything is unit-tested here" convention already established for repository classes.)

- [ ] **Step 4: Commit**

```bash
git add includes/RestApi/MeController.php
git commit -m "$(cat <<'EOF'
feat: add POST /me/profile/avatar for client avatar uploads

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `POST /me/password`

**Files:**
- Modify: `includes/RestApi/MeController.php`

**Interfaces:**
- Produces: `POST /merodiet/v1/me/password` — accepts `new_password`/`confirm_password`, changes the caller's own password, and re-authenticates them (changing your own password via `wp_set_password()` clears your auth cookie).

- [ ] **Step 1: Add the route**, after the avatar route:

```php
$this->register_route(
    '/password',
    array(
        'methods'  => WP_REST_Server::CREATABLE,
        'callback' => array( $this, 'change_password' ),
        'args'     => array(
            'new_password'     => array(
                'required' => true,
                'type'     => 'string',
            ),
            'confirm_password' => array(
                'required' => true,
                'type'     => 'string',
            ),
        ),
    ),
    required_capability: 'view_own_merodiet_plan'
);
```

- [ ] **Step 2: Add the handler**:

```php
/**
 * POST /me/password — change the caller's own password. Never accepts
 * a user id — always the currently logged-in user, resolved the same
 * way current_client_id() resolves identity.
 *
 * @param WP_REST_Request $request The current request.
 */
public function change_password( WP_REST_Request $request ): WP_REST_Response|WP_Error {
    $client_id = $this->current_client_id();

    if ( $client_id instanceof WP_Error ) {
        return $client_id;
    }

    // Deliberately not sanitize_text_field()'d — a password's exact
    // bytes matter, matching the same convention already used for
    // login/reset-password handling in PortalPage.
    $new_password     = (string) $request->get_param( 'new_password' );
    $confirm_password = (string) $request->get_param( 'confirm_password' );

    if ( strlen( $new_password ) < 8 ) {
        return $this->error( 'merodiet_password_too_short', __( 'Your new password must be at least 8 characters.', 'merodiet' ), 400 );
    }

    if ( $new_password !== $confirm_password ) {
        return $this->error( 'merodiet_password_mismatch', __( 'The two passwords you entered do not match.', 'merodiet' ), 400 );
    }

    $current_user = wp_get_current_user();

    wp_set_password( $new_password, $current_user->ID );

    // wp_set_password() clears the current auth cookie when changing
    // your own password — re-authenticate immediately so the client
    // isn't unexpectedly logged out by the request that just succeeded.
    wp_signon(
        array(
            'user_login'    => $current_user->user_login,
            'user_password' => $new_password,
            'remember'      => true,
        ),
        is_ssl()
    );

    return $this->success( array( 'changed' => true ) );
}
```

- [ ] **Step 3: Verify**

Run: `php -l includes/RestApi/MeController.php && vendor/bin/phpcs includes/RestApi/MeController.php && vendor/bin/phpstan analyse includes/RestApi/MeController.php && composer test`
Expected: no errors, full suite green.

- [ ] **Step 4: Commit**

```bash
git add includes/RestApi/MeController.php
git commit -m "$(cat <<'EOF'
feat: add POST /me/password for client self-service password changes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `Client` type update

**Files:**
- Modify: `src/types.ts`

**Interfaces:**
- Produces: `Client.avatar_id: number | null` and `Client.avatar_url: string | null` — consumed by Tasks 6-8.

- [ ] **Step 1: Update the `Client` interface**

Read `src/types.ts` first. Add two fields to the existing `Client` interface, right after `user_id: number | null;`:

```ts
	avatar_id: number | null;
	avatar_url: string | null;
```

- [ ] **Step 2: Verify**

Run: `npm run check-types`
Expected: no errors (this is a superset addition to an existing interface — nothing that reads `Client` today accesses these fields, so nothing breaks).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "$(cat <<'EOF'
feat: add avatar_id/avatar_url to the Client type

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `PasswordChangeModal`

**Files:**
- Create: `src/client-portal/PasswordChangeModal.tsx`
- Create: `src/client-portal/PasswordChangeModal.module.css`

**Interfaces:**
- Produces: `<PasswordChangeModal isOpen={boolean} onClose={() => void} />` — consumed by Task 7's `ProfileDrawer`.

- [ ] **Step 1: Read `src/components/ui/ProUpsellModal.tsx` and its `.module.css` first** — this component's structure (a fixed-position scrim + centered card) is the pattern to follow, adapted for a form instead of a single message+buttons.

- [ ] **Step 2: Create `PasswordChangeModal.tsx`**

```tsx
import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import Button from '../components/ui/Button';
import styles from './PasswordChangeModal.module.css';

interface PasswordChangeModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export default function PasswordChangeModal( {
	isOpen,
	onClose,
}: PasswordChangeModalProps ) {
	const [ newPassword, setNewPassword ] = useState( '' );
	const [ confirmPassword, setConfirmPassword ] = useState( '' );
	const [ isSaving, setIsSaving ] = useState( false );
	const [ errorMessage, setErrorMessage ] = useState< string | null >( null );
	const [ isDone, setIsDone ] = useState( false );

	if ( ! isOpen ) {
		return null;
	}

	const handleClose = () => {
		setNewPassword( '' );
		setConfirmPassword( '' );
		setErrorMessage( null );
		setIsDone( false );
		onClose();
	};

	const submit = async ( event: React.FormEvent ) => {
		event.preventDefault();
		setIsSaving( true );
		setErrorMessage( null );

		try {
			await apiFetch( {
				path: '/merodiet/v1/me/password',
				method: 'POST',
				data: {
					new_password: newPassword,
					confirm_password: confirmPassword,
				},
			} );
			setIsDone( true );
		} catch ( error ) {
			const message =
				error &&
				typeof error === 'object' &&
				'message' in error &&
				typeof error.message === 'string'
					? error.message
					: __(
							'Something went wrong — please try again.',
							'merodiet'
					  );
			setErrorMessage( message );
		} finally {
			setIsSaving( false );
		}
	};

	return (
		<div
			className={ styles.modalScrim }
			onClick={ ( e ) => e.target === e.currentTarget && handleClose() }
		>
			<div className={ styles.modal }>
				<h3>{ __( 'Change Password', 'merodiet' ) }</h3>
				{ isDone ? (
					<>
						<p>
							{ __(
								'Your password has been changed.',
								'merodiet'
							) }
						</p>
						<Button variant="primary" onClick={ handleClose }>
							{ __( 'Done', 'merodiet' ) }
						</Button>
					</>
				) : (
					<form onSubmit={ submit } className={ styles.form }>
						{ errorMessage && (
							<p className={ styles.error }>{ errorMessage }</p>
						) }
						<div className="merodiet-field">
							<label htmlFor="merodiet-new-password">
								{ __( 'New Password', 'merodiet' ) }
							</label>
							<input
								id="merodiet-new-password"
								type="password"
								value={ newPassword }
								onChange={ ( event ) =>
									setNewPassword( event.target.value )
								}
								required
								minLength={ 8 }
							/>
						</div>
						<div className="merodiet-field">
							<label htmlFor="merodiet-confirm-password">
								{ __( 'Confirm New Password', 'merodiet' ) }
							</label>
							<input
								id="merodiet-confirm-password"
								type="password"
								value={ confirmPassword }
								onChange={ ( event ) =>
									setConfirmPassword( event.target.value )
								}
								required
								minLength={ 8 }
							/>
						</div>
						<div className={ styles.actions }>
							<Button
								type="submit"
								variant="primary"
								disabled={ isSaving }
							>
								{ __( 'Save Password', 'merodiet' ) }
							</Button>
							<Button
								type="button"
								variant="ghost"
								onClick={ handleClose }
								disabled={ isSaving }
							>
								{ __( 'Cancel', 'merodiet' ) }
							</Button>
						</div>
					</form>
				) }
			</div>
		</div>
	);
}
```

- [ ] **Step 3: Create `PasswordChangeModal.module.css`**

```css
.modalScrim {
	position: fixed;
	inset: 0;
	background: rgba(38, 38, 42, 0.4);
	z-index: 70;
	display: flex;
	align-items: center;
	justify-content: center;
}
.modal {
	background: var(--surface-raised);
	border-radius: 14px;
	width: 360px;
	max-width: calc(100vw - 40px);
	padding: 26px;
}
.modal h3 {
	font-size: 16px;
	margin: 0 0 16px;
}
.form {
	display: flex;
	flex-direction: column;
	gap: 14px;
}
.actions {
	display: flex;
	gap: 8px;
}
.error {
	color: var(--critical);
	font-size: 13px;
	margin: 0;
}
```

- [ ] **Step 4: Verify**

Run: `npm run check-types && npx wp-scripts lint-js src/client-portal/PasswordChangeModal.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/client-portal/PasswordChangeModal.tsx src/client-portal/PasswordChangeModal.module.css
git commit -m "$(cat <<'EOF'
feat: add client-portal password-change modal

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `ProfileDrawer`

**Files:**
- Create: `src/client-portal/ProfileDrawer.tsx`
- Create: `src/client-portal/ProfileDrawer.module.css`

**Interfaces:**
- Consumes: `Client` type (Task 5), `PasswordChangeModal` (Task 6), the existing `Drawer`/`Button` components.
- Produces: `<ProfileDrawer isOpen={boolean} onClose={() => void} />` — consumed by Task 8.

- [ ] **Step 1: Read `src/screens/clients/ClientForm.tsx` first** — mirror its field-editing pattern (local form state, one `setField` helper, a `.merodiet-field` div per field) for the text fields here, but this form fetches its own data (there's no parent list passing a `client` prop the way the practitioner side has) and saves via `PATCH /me/profile` directly rather than a parent-owned store action.

- [ ] **Step 2: Create `ProfileDrawer.tsx`**

```tsx
import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import apiFetch from '@wordpress/api-fetch';
import Drawer from '../components/ui/Drawer';
import Button from '../components/ui/Button';
import PasswordChangeModal from './PasswordChangeModal';
import type { Client } from '../types';
import styles from './ProfileDrawer.module.css';

interface ProfileDrawerProps {
	isOpen: boolean;
	onClose: () => void;
}

interface FormValues {
	first_name: string;
	last_name: string;
	email: string;
	goals: string;
	dietary_restrictions: string;
	allergies: string;
}

const EMPTY: FormValues = {
	first_name: '',
	last_name: '',
	email: '',
	goals: '',
	dietary_restrictions: '',
	allergies: '',
};

export default function ProfileDrawer( {
	isOpen,
	onClose,
}: ProfileDrawerProps ) {
	const [ client, setClient ] = useState< Client | null >( null );
	const [ values, setValues ] = useState< FormValues >( EMPTY );
	const [ isSaving, setIsSaving ] = useState( false );
	const [ isUploadingAvatar, setIsUploadingAvatar ] = useState( false );
	const [ errorMessage, setErrorMessage ] = useState< string | null >( null );
	const [ isPasswordModalOpen, setPasswordModalOpen ] = useState( false );

	useEffect( () => {
		if ( ! isOpen ) {
			return;
		}

		apiFetch< Client >( { path: '/merodiet/v1/me/profile' } ).then(
			( data ) => {
				setClient( data );
				setValues( {
					first_name: data.first_name,
					last_name: data.last_name,
					email: data.email,
					goals: data.goals ?? '',
					dietary_restrictions: data.dietary_restrictions ?? '',
					allergies: data.allergies.join( ', ' ),
				} );
			}
		);
	}, [ isOpen ] );

	const setField =
		( field: keyof FormValues ) =>
		(
			event: React.ChangeEvent< HTMLInputElement | HTMLTextAreaElement >
		) =>
			setValues( ( prev ) => ( {
				...prev,
				[ field ]: event.target.value,
			} ) );

	const handleSubmit = async ( event: React.FormEvent ) => {
		event.preventDefault();
		setIsSaving( true );
		setErrorMessage( null );

		try {
			const updated = await apiFetch< Client >( {
				path: '/merodiet/v1/me/profile',
				method: 'PATCH',
				data: {
					first_name: values.first_name,
					last_name: values.last_name,
					email: values.email,
					goals: values.goals,
					dietary_restrictions: values.dietary_restrictions,
					allergies: values.allergies
						.split( ',' )
						.map( ( item ) => item.trim() )
						.filter( Boolean ),
				},
			} );
			setClient( updated );
		} catch {
			setErrorMessage(
				__( 'Something went wrong — please try again.', 'merodiet' )
			);
		} finally {
			setIsSaving( false );
		}
	};

	const handleAvatarChange = async (
		event: React.ChangeEvent< HTMLInputElement >
	) => {
		const file = event.target.files?.[ 0 ];

		if ( ! file ) {
			return;
		}

		setIsUploadingAvatar( true );
		setErrorMessage( null );

		try {
			const formData = new FormData();
			formData.append( 'avatar', file );

			const updated = await apiFetch< Client >( {
				path: '/merodiet/v1/me/profile/avatar',
				method: 'POST',
				body: formData,
			} );
			setClient( updated );
		} catch {
			setErrorMessage(
				__(
					'Could not upload that image — please try a JPEG, PNG, or WebP file.',
					'merodiet'
				)
			);
		} finally {
			setIsUploadingAvatar( false );
			event.target.value = '';
		}
	};

	return (
		<>
			<Drawer
				isOpen={ isOpen }
				title={ __( 'My Profile', 'merodiet' ) }
				onClose={ onClose }
			>
				{ ! client ? (
					<p>{ __( 'Loading…', 'merodiet' ) }</p>
				) : (
					<form
						onSubmit={ handleSubmit }
						className={ styles.form }
					>
						{ errorMessage && (
							<p className={ styles.error }>{ errorMessage }</p>
						) }

						<div className={ styles.avatarRow }>
							{ client.avatar_url ? (
								<img
									src={ client.avatar_url }
									alt=""
									className={ styles.avatarImage }
								/>
							) : (
								<div className={ styles.avatarPlaceholder }>
									{ ( client.first_name[ 0 ] ?? '' ) +
										( client.last_name[ 0 ] ?? '' ) }
								</div>
							) }
							<label className={ styles.avatarUpload }>
								{ isUploadingAvatar
									? __( 'Uploading…', 'merodiet' )
									: __( 'Change photo', 'merodiet' ) }
								<input
									type="file"
									accept="image/jpeg,image/png,image/webp"
									onChange={ handleAvatarChange }
									disabled={ isUploadingAvatar }
									hidden
								/>
							</label>
						</div>

						<div className="merodiet-field">
							<label htmlFor="merodiet-profile-first-name">
								{ __( 'First name', 'merodiet' ) }
							</label>
							<input
								id="merodiet-profile-first-name"
								type="text"
								value={ values.first_name }
								onChange={ setField( 'first_name' ) }
								required
							/>
						</div>
						<div className="merodiet-field">
							<label htmlFor="merodiet-profile-last-name">
								{ __( 'Last name', 'merodiet' ) }
							</label>
							<input
								id="merodiet-profile-last-name"
								type="text"
								value={ values.last_name }
								onChange={ setField( 'last_name' ) }
								required
							/>
						</div>
						<div className="merodiet-field">
							<label htmlFor="merodiet-profile-email">
								{ __( 'Email', 'merodiet' ) }
							</label>
							<input
								id="merodiet-profile-email"
								type="email"
								value={ values.email }
								onChange={ setField( 'email' ) }
								required
							/>
						</div>
						<div className="merodiet-field">
							<label htmlFor="merodiet-profile-goals">
								{ __( 'Goals', 'merodiet' ) }
							</label>
							<textarea
								id="merodiet-profile-goals"
								rows={ 3 }
								value={ values.goals }
								onChange={ setField( 'goals' ) }
							/>
						</div>
						<div className="merodiet-field">
							<label htmlFor="merodiet-profile-dietary">
								{ __( 'Dietary restrictions', 'merodiet' ) }
							</label>
							<textarea
								id="merodiet-profile-dietary"
								rows={ 2 }
								value={ values.dietary_restrictions }
								onChange={ setField(
									'dietary_restrictions'
								) }
							/>
						</div>
						<div className="merodiet-field">
							<label htmlFor="merodiet-profile-allergies">
								{ __( 'Allergies', 'merodiet' ) }
							</label>
							<input
								id="merodiet-profile-allergies"
								type="text"
								value={ values.allergies }
								onChange={ setField( 'allergies' ) }
								placeholder={ __(
									'Peanuts, shellfish',
									'merodiet'
								) }
							/>
							<div className="merodiet-field-hint">
								{ __( 'Comma-separated', 'merodiet' ) }
							</div>
						</div>

						<Button
							type="submit"
							variant="primary"
							disabled={ isSaving }
						>
							{ __( 'Save changes', 'merodiet' ) }
						</Button>

						<button
							type="button"
							className={ styles.passwordLink }
							onClick={ () => setPasswordModalOpen( true ) }
						>
							{ __( 'Change password', 'merodiet' ) }
						</button>
					</form>
				) }
			</Drawer>

			<PasswordChangeModal
				isOpen={ isPasswordModalOpen }
				onClose={ () => setPasswordModalOpen( false ) }
			/>
		</>
	);
}
```

- [ ] **Step 3: Create `ProfileDrawer.module.css`**

```css
.form {
	display: flex;
	flex-direction: column;
	gap: 16px;
}
.error {
	color: var(--critical);
	font-size: 13px;
	margin: 0;
}
.avatarRow {
	display: flex;
	align-items: center;
	gap: 14px;
	margin-bottom: 4px;
}
.avatarImage {
	width: 56px;
	height: 56px;
	border-radius: 50%;
	object-fit: cover;
}
.avatarPlaceholder {
	width: 56px;
	height: 56px;
	border-radius: 50%;
	background: var(--sage);
	color: #fff;
	display: flex;
	align-items: center;
	justify-content: center;
	font-weight: 700;
	font-size: 18px;
}
.avatarUpload {
	font-size: 13px;
	font-weight: 600;
	color: var(--sage);
	cursor: pointer;
}
.passwordLink {
	background: none;
	border: none;
	border-top: 1px solid var(--line);
	padding-top: 16px;
	margin-top: 4px;
	font-size: 13px;
	font-weight: 600;
	color: var(--sage);
	text-align: left;
	cursor: pointer;
}
```

- [ ] **Step 4: Verify**

Run: `npm run check-types && npx wp-scripts lint-js src/client-portal/ProfileDrawer.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/client-portal/ProfileDrawer.tsx src/client-portal/ProfileDrawer.module.css
git commit -m "$(cat <<'EOF'
feat: add client-portal profile drawer with avatar upload

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Wire the profile drawer into the sidebar

**Files:**
- Modify: `src/client-portal/PortalSidebar.tsx`
- Modify: `src/client-portal/App.tsx`

**Interfaces:**
- Consumes: `ProfileDrawer` (Task 7).

- [ ] **Step 1: Read both files first** — `App.tsx` owns top-level state (like `isSidebarOpen`); `PortalSidebar.tsx` renders the rail-foot with the client's name.

- [ ] **Step 2: In `App.tsx`**, add profile-drawer state and pass an `onOpenProfile` callback down:

Add near the other `useState` calls:
```tsx
const [ isProfileOpen, setProfileOpen ] = useState( false );
```

Add the import:
```tsx
import ProfileDrawer from './ProfileDrawer';
```

Pass `onOpenProfile={ () => setProfileOpen( true ) }` as a new prop on the existing `<PortalSidebar ... />` element, and render `<ProfileDrawer isOpen={ isProfileOpen } onClose={ () => setProfileOpen( false ) } />` as a sibling of `<div className="merodiet-shell">` (same level, so the drawer overlays the whole app regardless of which section is active).

- [ ] **Step 3: In `PortalSidebar.tsx`**, add the new prop and make the rail-foot clickable:

Add to `PortalSidebarProps`:
```tsx
onOpenProfile: () => void;
```

Change the `merodiet-rail-foot` div from a plain `<div>` to a `<button>` (so it's natively focusable/keyboard-operable, matching this codebase's established preference for real interactive elements over div+role hacks — see the earlier `merodiet-rail-scrim`/`Drawer` scrim fixes in this same project for why):

```tsx
<button className="merodiet-rail-foot" onClick={ onOpenProfile }>
	<div className="merodiet-user-avatar">
		{ /* existing avatar content unchanged */ }
	</div>
	{ /* existing name/role div unchanged */ }
	<ThemeToggle />
</button>
```

Note: `ThemeToggle` is itself a `<button>` — a `<button>` nested inside another `<button>` is invalid HTML. Move `ThemeToggle` OUTSIDE the new rail-foot button instead, as a sibling immediately after it, and wrap both in a small flex container so they still sit on one row visually. Read the current `merodiet-rail-foot` CSS in `src/styles/base.css` (`display: flex; align-items: center; gap: 9px; padding: 8px 10px; ...`) — replicate that exact layout on a new wrapping div, put `className="merodiet-rail-foot"` on that wrapper (unchanged, so admin's identical CSS still applies), and make the avatar+name portion inside it a `<button>` with its own reset styling (no border/background, inherit layout) so only that portion is clickable while `ThemeToggle` stays a separate, adjacent button:

```tsx
<div className="merodiet-rail-foot">
	<button
		type="button"
		onClick={ onOpenProfile }
		style={ {
			display: 'flex',
			alignItems: 'center',
			gap: 9,
			flex: 1,
			minWidth: 0,
			background: 'none',
			border: 'none',
			padding: 0,
			cursor: 'pointer',
			textAlign: 'left',
		} }
	>
		<div className="merodiet-user-avatar">
			{ initialsFor( clientName ) }
		</div>
		<div style={ { flex: 1, minWidth: 0 } }>
			<div className="merodiet-rail-foot-name">{ clientName }</div>
			<div className="merodiet-rail-foot-role">
				{ __( 'Client', 'merodiet' ) }
			</div>
		</div>
	</button>
	<ThemeToggle />
</div>
```

This replaces the existing `<div className="merodiet-rail-foot">...</div>` block entirely (the one already there from the earlier sidebar-conversion task) — same visual result, but the avatar+name portion is now a real button.

- [ ] **Step 4: Verify**

Run: `npm run check-types && npx wp-scripts lint-js src/client-portal/App.tsx src/client-portal/PortalSidebar.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/client-portal/App.tsx src/client-portal/PortalSidebar.tsx
git commit -m "$(cat <<'EOF'
feat: open the profile drawer from the sidebar footer

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Final verification + JOURNEY.md

**Files:** None changed except `JOURNEY.md`.

- [ ] **Step 1: Full verification**

```bash
composer test
vendor/bin/phpcs includes/Repositories/ClientRepository.php includes/RestApi/MeController.php database/migrations/2026_09_08_000000_create_clients_table.php
vendor/bin/phpstan analyse includes/
npm run check-types
npx wp-scripts lint-js src/
npm run build
```
Expected: everything green; `build/client-portal.js`/`.css` regenerated successfully.

- [ ] **Step 2: Update `JOURNEY.md`**

Find the existing bullet: `"**Not yet built — client-uploaded profile picture:** deferred to Phase 3 alongside the client portal itself..."` (in the Clients section). Update it to say a client can now upload their own avatar from the portal's profile drawer (`POST /me/profile/avatar`), stored as `avatar_id`/exposed as `avatar_url` on the `Client` type — but note it's only wired up in the profile drawer itself so far, not yet shown on the practitioner-side roster/plan-assignment screens (that propagation is a small separate follow-up, not done in this plan). Keep it as terse as the surrounding bullets.

- [ ] **Step 3: Commit**

```bash
git add JOURNEY.md
git commit -m "$(cat <<'EOF'
docs: note client-portal profile/avatar/password features as built

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
