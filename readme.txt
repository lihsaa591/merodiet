=== Nutrio – Dietitian Practice Manager ===
Contributors: lihsaa591
Tags: dietitian, nutritionist, meal planner, nutrition, client management
Requires at least: 6.9
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Dietitian and nutritionist practice manager: client records, meal plans, food logs and USDA nutrition data in one dashboard.

== Description ==

Nutrio is a practice management tool for dietitians and nutritionists. It lives in your WordPress admin, so you can keep your clients, meal plans and progress notes in one place on your own website, without a separate monthly subscription.

You build a meal plan, give it to a client, and the client follows it from a simple page on your site. You then see how they are doing.

= How it works =

1. **Build a plan.** Pick foods and recipes, and see the calories and nutrients add up as you go.
2. **Give it to a client.** Invite a client by email. They get their own login and see only their own plan.
3. **The client logs their day.** They tick off meals they ate, note any swaps, and record weight and other measurements.
4. **You review progress.** A dashboard shows how all your clients are doing, and what was planned against what was eaten for each person.

= For practitioners =

* **Client list.** Add clients, and send invitations to the client portal.
* **Meal plans.** Build plans made of days and meals, using a recipe builder and your own custom foods.
* **Nutrition numbers.** Calories and nutrients come from USDA FoodData Central, a free and trusted public food database.
* **Fixed plan totals.** When you give a plan to a client, its totals are saved at that moment. Later changes to the food data will not quietly change a plan the client already has.
* **Dashboard.** See compliance and recent activity across your clients.
* **Emails.** Edit the emails sent to clients, and turn on a daily digest of client activity.
* **Your data, your choice.** Keep or delete all Nutrio data when you delete the plugin, with a setting under Nutrio > Settings.

= For clients =

* **Their own portal.** Clients sign in at `yoursite.com/client-portal/`, or you can place the portal on any page with the `[nutrio_client_portal]` shortcode.
* **Easy to use on a phone.** The layout adapts to small screens.
* **Accessibility.** The interface is tested with automated accessibility checks (axe).

= Who is it for? =

Registered dietitians, nutritionists and nutrition coaches who work with individual clients and want their plans and records on their own WordPress site.

= Good to know =

* You need a free USDA FoodData Central API key. Nutrio guides you to get one in Settings.
* Nutrio adds two user roles, `practitioner` and `nutrition_client`. All access is limited to these roles.
* Nutrio is a record-keeping and planning tool. It does not give medical advice.

= Use of 3rd Party Services =

Nutrio has one third-party service, and it is only contacted by a practitioner searching for or loading a food. No client or personal data is sent. Nutrio does not include tracking, advertising or usage telemetry.

* **USDA FoodData Central** (food search and nutrient data): [Terms of Use](https://fdc.nal.usda.gov/api-guide.html) | [Privacy Policy](https://www.usda.gov/privacy-policy)
  * Endpoint: https://api.nal.usda.gov/fdc/v1
  * Data sent: the food search text or food ID being requested, and the API key you enter in Nutrio settings.
  * When: only when a food is not already cached locally.
  * You need your own free API key: https://fdc.nal.usda.gov/api-key-signup.html

Emails (client invitations, plan notifications, the daily digest) are sent through your site's own mail setup using `wp_mail()`. Nutrio does not connect to an email service itself, so any SMTP or email plugin you use applies.

Nutrio is not affiliated with or endorsed by the U.S. Department of Agriculture (USDA).

= Data and privacy =

Client records, plans, food logs and measurements are stored in custom tables in your WordPress database. Nothing is sent to the plugin author. Data is kept when you delete the plugin unless you turn on "Delete all Nutrio data when the plugin is deleted" under Nutrio > Settings > General.

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

WordPress 6.9+ and PHP 8.1+.

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
