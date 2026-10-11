export function consolidateGroceryList(selectedRecipes) {
  const aggregatedMap = new Map();

  selectedRecipes.forEach(recipe => {
    recipe.ingredients.forEach(item => {
      const key = `${item.name.toLowerCase().trim()}_${item.unit.toLowerCase().trim()}`;
      if (aggregatedMap.has(key)) {
        const existing = aggregatedMap.get(key);
        existing.amount += item.amount;
      } else {
        aggregatedMap.set(key, {
          fdcId: item.fdcId || null,
          name: item.name,
          amount: item.amount,
          unit: item.unit,
          checked: false
        });
      }
    });
  });

  return Array.from(aggregatedMap.values());
}
