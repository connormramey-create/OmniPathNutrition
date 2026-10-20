// src/utils/mealPrep.js
// Normalizes recipe records so the planner can reason about them per serving.
//
// The bundled starter data (meals_400.json) stores calories/macros for the WHOLE
// recipe, its macros often don't add up to its calories, and every recipe has the
// same $2.50 cost. This module:
//   • estimates servings from total calories (~500 kcal per serving)
//   • rescales protein/carbs/fat so 4P + 4C + 9F matches the listed calories
//   • estimates cost per serving from ingredient weights (see data/ingredientPrices.js)
//   • tags which meal slots a recipe fits (breakfast / main / snack)

import { PRICE_PER_LB, DEFAULT_PRICE_PER_LB } from '../data/ingredientPrices';

const GRAMS_PER_LB = 453.592;

const BREAKFAST_RE = /\b(breakfast|oats?|oatmeal|overnight|porridge|granola|pancakes?|waffles?|french toast|omelets?|omelettes?|frittata|scrambled|scramble|eggs? (?:bake|cups?|muffins?|casserole)|quiche|muffins?|smoothie|yogurt|parfait|chia|hash|shakshuka|crepes?|breakfast burrito|avocado toast)\b/i;
const SNACK_RE = /\b(snack|dip|hummus|guacamole|bars?|bites|energy balls?|trail mix|popcorn|crackers|smoothie|shake|parfait|yogurt|ants on a log|edamame|roasted nuts|jerky|fruit salad|deviled eggs?|roll-?ups?|muffins?|chia)\b/i;
const MAIN_RE = /\b(chicken|beef|steak|pork|turkey|lamb|fish|salmon|tuna|cod|tilapia|shrimp|prawns?|mussels|scallops?|crab|tofu|tempeh|seitan|chili|stew|soup|curry|pasta|spaghetti|linguine|penne|lasagna|noodles?|ramen|risotto|rice|quinoa|salad|bowl|tacos?|burritos?|enchiladas?|fajitas?|quesadillas?|sandwich|wrap|burgers?|pizza|stir[- ]?fry|casserole|meatballs?|meatloaf|skillet|roast|kebabs?|skewers?|frittata|quiche|lentils?|beans?|chickpeas?|chick peas|dal|dahl|gumbo|jambalaya|paella|goulash|gjuwetsch|sausage|eggs?|omelets?|patties|cutlets?|fillets?|chops?)\b/i;
const DESSERT_RE = /\b(cakes?|cupcakes?|cookies?|brownies?|blondies?|fudge|toffee|candy|brulee|pies?|tarts?|frosting|icing|cheesecake|truffles?|rugelach|spitzbuben|ice cream|sorbet|donuts?|doughnuts?|caramel|meringues?|macarons?|biscotti|pralines?|cobbler|crumble|crisp|bread pudding|pudding|mousse|tiramisu|baklava|sweet rolls?|cinnamon rolls?|scones?)\b/i;
const CONDIMENT_RE = /\b(sauces?|dressing|vinaigrette|marinade|rub|seasoning|spice mix|gravy|syrup|jam|jelly|aioli|pesto|chutney|relish|stock|broth|oil|vinegar|butter|cocktail|martini|margarita|sangria|punch|liqueur|limoncello|cocoa|hot chocolate|tea|coffee|latte|lemonade|juice|sipper|drink|cordial|infusion|salt|substitute|blend|powder|extract|concentrate|frosting)\b/i;
const BAKED_COMPONENT_RE = /\b(breads?|loaf|loaves|rolls|buns?|biscuits?|bagels?|crackers?|tortillas?|pizza dough|dough|croutons?|crust)\b/i;

const PRICE_RULES = PRICE_PER_LB.map(([kw, price]) => [new RegExp(`\\b${kw}`, 'i'), price]);

export function estimatePricePerLb(name = '') {
  for (const [re, price] of PRICE_RULES) {
    if (re.test(name)) return price;
  }
  return DEFAULT_PRICE_PER_LB;
}

export function ingredientName(ing) {
  return ing.food || ing.name || ing.text || 'Ingredient';
}

export function ingredientGrams(ing) {
  const amount = Number(ing.amount ?? ing.weight ?? 0);
  const unit = String(ing.unit || ing.measure || 'g').toLowerCase();
  if (unit === 'kg') return amount * 1000;
  if (unit === 'oz') return amount * 28.3495;
  if (unit === 'lb') return amount * GRAMS_PER_LB;
  return amount; // grams (or unknown – treat as grams)
}

export function estimateRecipeCost(ingredients = []) {
  return ingredients.reduce(
    (sum, ing) => sum + (ingredientGrams(ing) / GRAMS_PER_LB) * estimatePricePerLb(ingredientName(ing)),
    0
  );
}

function normalizeMacros(m = {}) {
  const calories = Number(m.calories) || 0;
  let protein = Number(m.protein) || 0;
  let carbs = Number(m.carbs) || 0;
  let fat = Number(m.fat) || 0;
  const atwater = protein * 4 + carbs * 4 + fat * 9;
  if (calories > 0 && atwater > 0 && Math.abs(atwater - calories) / calories > 0.15) {
    const k = calories / atwater;
    protein *= k;
    carbs *= k;
    fat *= k;
  }
  return { calories, protein, carbs, fat };
}

const r1 = n => Math.round(n * 10) / 10;

/**
 * Adds planner fields to a recipe without changing the original fields:
 *   servings, perServing {calories, protein, carbs, fat}, costPerServing, slots[]
 * Custom recipes built in the app already store per-serving macros.
 */
export function prepareMeal(meal) {
  if (meal.perServing && meal.slots) return meal;

  // Curated dataset (src/data/recipes_500.json): servings, per-serving macros, meal types
  // and cost are already calculated from USDA reference values – use them as-is.
  if (Array.isArray(meal.mealType) && meal.macrosPerServing) {
    return {
      ...meal,
      servings: Number(meal.servings) || 1,
      perServing: { ...meal.macrosPerServing },
      costPerServing: Number(meal.costPerServingUSD) || 0,
      slots: meal.mealType,
      isDessert: false,
      isCondiment: false,
      isBakedComponent: false
    };
  }

  const isCustom = String(meal.id || '').startsWith('custom');
  let servings;
  let perServing;

  if (isCustom) {
    servings = Number(meal.servings) || 1;
    perServing = { ...normalizeMacros(meal.macros) };
  } else {
    const total = normalizeMacros(meal.macros);
    servings = Math.min(12, Math.max(1, Math.round(total.calories / 500)));
    perServing = {
      calories: total.calories / servings,
      protein: total.protein / servings,
      carbs: total.carbs / servings,
      fat: total.fat / servings
    };
  }
  perServing = {
    calories: Math.round(perServing.calories),
    protein: r1(perServing.protein),
    carbs: r1(perServing.carbs),
    fat: r1(perServing.fat)
  };

  const estimatedTotal = estimateRecipeCost(meal.ingredients);
  const costPerServing = isCustom && meal.costPerServingUSD
    ? Number(meal.costPerServingUSD)
    : Math.max(0.25, estimatedTotal / servings);

  const name = meal.name || '';
  const slots = [];
  const isDessert = DESSERT_RE.test(name) && !/\bchia pudding\b/i.test(name);
  const isCondiment = CONDIMENT_RE.test(name) && !/\b(soup|stew|curry|chicken|beef|pork|salmon|fish|shrimp|pasta|salad|bowl)\b/i.test(name);
  const isBakedComponent = BAKED_COMPONENT_RE.test(name) && !MAIN_RE.test(name) && !/\bmuffins?\b/i.test(name);
  const proteinShare = perServing.calories > 0 ? (perServing.protein * 4) / perServing.calories : 0;

  if (!isDessert && !isCondiment && !isBakedComponent) {
    if (BREAKFAST_RE.test(name)) slots.push('Breakfast');
    if (SNACK_RE.test(name) || (perServing.calories < 300 && perServing.calories >= 80)) slots.push('Snack');
    const looksLikeMain = MAIN_RE.test(name) && !/\bmuffins?\b/i.test(name);
    if (looksLikeMain && perServing.calories >= 250 && proteinShare >= 0.12) slots.push('Lunch', 'Dinner');
  }

  return {
    ...meal,
    servings,
    perServing,
    costPerServing: Math.round(costPerServing * 100) / 100,
    slots,
    isDessert,
    isCondiment,
    isBakedComponent
  };
}
