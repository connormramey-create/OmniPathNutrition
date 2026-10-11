import fs from 'fs';
import path from 'path';

// Load raw Hugging Face dataset file
const rawData = JSON.parse(fs.readFileSync('./raw_recipes.json', 'utf8'));

const formattedMeals = rawData.slice(0, 400).map((recipe, index) => ({
  id: `meal-${String(index + 1).padStart(3, '0')}`,
  name: recipe.title || recipe.name || `Healthy Recipe ${index + 1}`,
  budgetTier: recipe.budget_tier || (recipe.cost ? (recipe.cost < 2.5 ? 1 : recipe.cost < 5 ? 2 : 3) : 1),
  costPerServingUSD: Number((recipe.cost_per_serving || 2.50).toFixed(2)),
  prepTimeMinutes: recipe.prep_time || recipe.cook_time || 15,
  macros: {
    calories: Math.round(recipe.calories || recipe.nutrients?.calories || 0),
    protein: Math.round(recipe.protein_g || recipe.nutrients?.protein || 0),
    carbs: Math.round(recipe.carbs_g || recipe.nutrients?.carbohydrates || 0),
    fat: Math.round(recipe.fat_g || recipe.nutrients?.fat || 0)
  },
  dietaryFlags: {
    isHalal: recipe.is_halal ?? true,
    isVegetarian: recipe.is_vegetarian ?? false,
    isDairyFree: recipe.is_dairy_free ?? false,
    isNutFree: recipe.is_nut_free ?? true,
    isGlutenFree: recipe.is_gluten_free ?? false,
    isKosher: recipe.is_kosher ?? true
  },
  ingredients: Array.isArray(recipe.ingredients) 
    ? recipe.ingredients.map(ing => typeof ing === 'string' ? { name: ing, amount: 100, unit: 'g' } : ing)
    : [],
  instructions: Array.isArray(recipe.instructions) 
    ? recipe.instructions.join(' ') 
    : recipe.instructions || 'Combine ingredients and serve.'
}));

const outputPath = path.join(process.cwd(), 'src', 'data', 'meals_400.json');
fs.writeFileSync(outputPath, JSON.stringify(formattedMeals, null, 2));
console.log(`Successfully converted and wrote ${formattedMeals.length} recipes to src/data/meals_400.json`);
