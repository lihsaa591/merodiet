export interface Client {
	id: number;
	practitioner_user_id: number;
	user_id: number | null;
	first_name: string;
	last_name: string;
	email: string;
	goals: string | null;
	dietary_restrictions: string | null;
	allergies: string[];
	status: 'active' | 'paused';
	created_at: string;
	updated_at: string;
}

export type ClientInput = Pick< Client, 'first_name' | 'last_name' | 'email' > & {
	allergies?: string[];
};

declare global {
	interface Window {
		nutrioAdmin?: {
			restUrl?: string;
			restNonce?: string;
			mountId?: string;
			adminUrl?: string;
			currentUserName?: string;
			currentUserInitials?: string;
			// wp_localize_script serializes PHP booleans as the string "1" or
			// "" — never a real JS boolean — so check truthiness, not `=== true`.
			isDevelopment?: string;
		};
	}
}
