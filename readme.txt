=== Nutrio ===
Contributors: lihsaa591
Tags: dietitian, nutritionist, meal planner, nutrition, client management
Requires at least: 6.4
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Dietitian and nutritionist practice manager: client records, meal plans, food logs and USDA nutrition data in your WordPress dashboard.

== Description ==

Nutrio gives dietitians and nutritionists a client and meal-planning workspace inside WordPress, plus a portal where clients log meals and follow their plan.

**For practitioners**

* Client management with invitations and a dashboard of compliance and recent activity.
* Meal plans built from days and items, with a recipe builder and custom foods.
* Nutrient calculations backed by USDA FoodData Central.
* Email digests and customizable email templates.

**For clients**

* A front-end portal where clients sign in, view their plan and log meals.
* Accessibility-tested interface (axe) with a responsive layout for phones.

Nutrio adds two roles, `practitioner` and `nutrition_client`, and gates all access through them.

= External services =

Nutrio connects to the USDA FoodData Central API to search foods and retrieve nutrient data.

* Service: USDA FoodData Central (https://fdc.nal.usda.gov/)
* Endpoint: https://api.nal.usda.gov/fdc/v1
* Data sent: the food search text or food ID you request, and the API key you enter in Nutrio settings. No client or personal data is sent.
* When: only when a practitioner searches for or loads a food that is not already cached locally.
* Terms of use and data policy: https://fdc.nal.usda.gov/api-guide.html and https://www.usda.gov/privacy-policy

You must supply your own free API key from https://fdc.nal.usda.gov/api-key-signup.html.

= Data and privacy =

Client records, plans, food logs and measurements are stored in custom tables in your WordPress database. Nothing is sent to the plugin author. Data is kept on uninstall unless the `nutrio_delete_data_on_uninstall` option is set to `1`.

== Installation ==

1. Upload the `nutrio` folder to `/wp-content/plugins/`, or install it from the Plugins screen.
2. Activate the plugin.
3. Open **Nutrio** in the admin menu and enter your USDA FoodData Central API key under Settings.
4. Invite your first client.

== Frequently Asked Questions ==

= Do I need an API key? =

Yes. A free USDA FoodData Central key is required for food search and nutrient data.

= What happens to my data if I uninstall? =

Data is preserved by default. To remove all Nutrio tables, options and roles when the plugin is deleted, turn on "Delete all Nutrio data when the plugin is deleted" under Nutrio > Settings > General first.

= What are the requirements? =

WordPress 6.4+ and PHP 8.1+.

== Screenshots ==

1. Practitioner dashboard.
2. Plan builder.
3. Client portal.

== Changelog ==

= 0.1.0 =
* Pre-release; first submission to the WordPress.org directory (review version).

== Upgrade Notice ==

= 0.1.0 =
Initial directory release.
