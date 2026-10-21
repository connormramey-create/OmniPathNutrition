// src/utils/ingredientFilter.js
// Helpers for the "Exclude ingredients" filter in the settings bar.

const ingredientTexts = (ing = {}) =>
  [ing.food, ing.name, ing.text]
    .filter(Boolean)
    .map(s => String(s).toLowerCase());

/** Unique, sorted list of ingredient names across all recipes (for the picker). */
export function buildIngredientOptions(meals = []) {
  const names = new Set();
  meals.forEach(meal => {
    (meal.ingredients || []).forEach(ing => {
      const name = String(ing.food || ing.name || '').trim().toLowerCase();
      if (name && name.length <= 80) names.add(name);
    });
  });
  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * True when any ingredient in the recipe contains one of the excluded terms.
 * Matching is a case-insensitive "contains", so excluding "cheese" also hides
 * recipes with "feta cheese" or "shredded cheddar cheese".
 */
export function containsExcludedIngredient(meal, excluded = []) {
  if (!excluded.length) return false;
  return (meal.ingredients || []).some(ing => {
    const texts = ingredientTexts(ing);
    return excluded.some(term => texts.some(t => t.includes(term)));
  });
}

export const normalizeTerm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
