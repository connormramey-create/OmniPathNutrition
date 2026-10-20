OmniPath Nutrition
Recipe builder, weekly meal planner, and grocery list for Kroger, Walmart, and Publix.
Setup
```bash
npm install
cp .env.example .env   # then fill in your values
npm run dev
```
Firebase: needed for login and cloud sync. Without it the app runs in guest mode, and settings are saved in the browser.
USDA key: get a free key at https://fdc.nal.usda.gov/api-key-signup and set it as `VITE_USDA_API_KEY`.
`DEMO_KEY` only allows about 30 requests/hour and 50/day per IP, which is why ingredient search used to stop working after a few searches.
GitHub Pages deploy: add the same `VITE_*` values as repository secrets. `deploy.yml` reads them from there.
> `.env` must never be committed. If it was committed before, remove it from tracking with `git rm --cached .env`.
> Also restrict your Firebase API key to your domains in Google Cloud Console, and make sure your Firestore security rules are locked down.
Public community recipes
Recipes marked Make public are copied to a shared Firestore collection called `publicRecipes`. Every signed-in account can see them, but only the author can change, unpublish or delete them.
Deploy the security rules once, or the community feed won't load. Run `firebase deploy --only firestore:rules`, or paste `firestore.rules` into Firebase console > Firestore > Rules.
Public recipes show the author's display name (or "Community member"). Email addresses are never stored or shown.
Recipes that were marked public before this change are published automatically the next time their author logs in.
Features
Meal Plan Generator: enter sex, age, weight, height, activity level, goal (lose, maintain, or gain), and weekly grocery budget.
Daily calories use the Mifflin-St Jeor equation, at about 1 lb/week loss or 0.5 lb/week gain.
Macro targets: protein 1.6–1.8 g/kg, fat 28% of calories, carbs make up the rest.
Builds a 7-day plan that hits those targets within your estimated budget.
Preferred Store setting (Kroger, Walmart, or Publix via Instacart): "Send to cart" walks you through your list. Each item opens a search on the store in a single reusable tab, where you tap Add to cart. "Copy list" pastes into the store app's list.
USDA serving sizes: each search result, the inspector, and every selected ingredient has a quantity and serving-size dropdown (cups, slices, label servings, g, oz, lb). Recipe macros are calculated from USDA nutrient data.
Notes and limitations
Fully automatic cart filling needs store partner APIs and a backend: Kroger Cart API (OAuth with a client secret), Instacart Developer Platform (Publix), and Walmart affiliate item IDs. A static site can't do this safely.
Recipe costs are estimates from average US prices in `src/data/ingredientPrices.js`. Edit that file to match your local stores.
The bundled starter recipes list totals for the whole recipe, and their macros often don't match their calories. The app sets servings to about 500 kcal each and rescales macros to match calories. Recipes you build with USDA data are accurate.
