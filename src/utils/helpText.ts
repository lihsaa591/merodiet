import { __ } from '@wordpress/i18n';

// Shared tooltip copy — kept here (rather than duplicated at each call
// site) so the same explanation can be reused wherever branded-product
// USDA data comes up (recipe builder, plan builder's food search, etc.)
// without drifting out of sync between copies.
export const BRANDED_FOODS_HELP_TEXT = __(
	"Branded (manufacturer-supplied) products are hidden by default — some report their serving size in a way that can't be reliably added to a recipe. Foundation & SR Legacy always work.",
	'merodiet'
);

export const SEND_INVITE_HELP_TEXT = __(
	"Creates the client's portal account and emails them a link to set their password, right away. Leave this unchecked to add their details now and invite them later from the roster.",
	'merodiet'
);
