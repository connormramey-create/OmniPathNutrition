// src/services/groceryAggregator.js
// Combines every scheduled meal's ingredients into one list.
// Amounts are scaled by how many servings are planned vs. how many the recipe makes.

import { ingredientGrams } from '../utils/mealPrep';

// "Bananas" + "banana", "tomatoes" + "tomato" → one line
function singularKey(name) {
  const n = name.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/(ss|us|is)$/.test(n) || n.length <= 3) return n;
  if (n.endsWith('ies')) return n.slice(0, -3) + 'y';
  if (/(oes|ches|shes|xes)$/.test(n)) return n.slice(0, -2);
  if (n.endsWith('s')) return n.slice(0, -1);
  return n;
}

export function consolidateGroceryList(scheduledMeals) {
  const aggregatedMap = new Map();

  scheduledMeals.forEach(entry => {
    const meal = entry.mealData || entry;
    if (!meal || !Array.isArray(meal.ingredients)) return;

    const recipeServings = Number(meal.servings) || 1;
    const plannedServings = Number(entry.servings) || recipeServings; // legacy entries = whole recipe
    const scale = plannedServings / recipeServings;

    meal.ingredients.forEach(item => {
      // Prefer the short "food" name (e.g. "spinach") over free text ("Handful spinach leaves")
      const rawName = (item.food || item.name || item.text || 'Ingredient').trim();
      const unitRaw = String(item.unit || item.measure || 'g').toLowerCase().trim();
      const isMass = ['g', 'kg', 'oz', 'lb'].includes(unitRaw);
      const amount = isMass ? ingredientGrams(item) * scale : Number(item.amount || item.weight || 1) * scale;
      const unit = isMass ? 'g' : unitRaw;
      const key = `${singularKey(rawName)}_${unit}`;

      // Whole items (eggs, peppers, tortillas) and cans are easier to shop by count
      const countUnit = ['each', 'can'].includes(item.householdUnit) ? item.householdUnit : null;
      const count = countUnit ? Number(item.quantity || 0) * scale : 0;

      if (aggregatedMap.has(key)) {
        const existing = aggregatedMap.get(key);
        existing.amount += amount;
        if (existing.countUnit && existing.countUnit === countUnit) existing.count += count;
        else existing.countUnit = null;
      } else {
        aggregatedMap.set(key, {
          fdcId: item.fdcId || null,
          name: rawName,
          amount,
          unit,
          countUnit,
          count,
          canLabel: countUnit === 'can' ? (String(item.text || '').match(/\(([^)]+)\) can/)?.[1] || '') : '',
          checked: false
        });
      }
    });
  });

  return Array.from(aggregatedMap.values())
    .map(i => ({ ...i, amount: Math.round(i.amount * 10) / 10 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
