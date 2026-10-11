// src/services/groceryAggregator.js

export function consolidateGroceryList(scheduledMeals) {
  const aggregatedMap = new Map();

  scheduledMeals.forEach(entry => {
    const meal = entry.mealData || entry;
    if (!meal || !Array.isArray(meal.ingredients)) return;

    meal.ingredients.forEach(item => {
      const rawName = item.name || item.food || item.text || 'Ingredient';
      const unit = item.unit || item.measure || 'g';
      const amount = Number(item.amount || item.weight || 1);
      const key = `${rawName.toLowerCase().trim()}_${unit.toLowerCase().trim()}`;

      if (aggregatedMap.has(key)) {
        const existing = aggregatedMap.get(key);
        existing.amount += amount;
      } else {
        aggregatedMap.set(key, {
          fdcId: item.fdcId || null,
          name: rawName,
          amount: amount,
          unit: unit,
          checked: false
        });
      }
    });
  });

  return Array.from(aggregatedMap.values());
}
