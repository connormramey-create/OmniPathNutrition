import fs from 'fs';
import path from 'path';

const rawFilePath = './raw_corrupted_meals.json'; // Path to your raw corrupted file
const outputPath = './src/data/meals_400.json';

function repairIngredients(ingredientsArray) {
  if (!Array.isArray(ingredientsArray)) return [];

  // Check if ingredients were broken into dummy string objects
  const combinedString = ingredientsArray
    .map(item => item.name || '')
    .join(',');

  try {
    // Attempt to parse properly formatted JSON strings inside the property
    const parsed = JSON.parse(combinedString);
    if (Array.isArray(parsed)) {
      return parsed.map(ing => ({
        food: ing.food || ing.text || 'Unknown Ingredient',
        text: ing.text || ing.food || '',
        weight: ing.weight || 100,
        measure: ing.measure || 'g',
        quantity: ing.quantity || 1
      }));
    }
  } catch (e) {
    // Fallback parser using regular expressions for broken string fragments
    const foodMatches = [...combinedString.matchAll(/"food":"([^"]+)"/g)].map(m => m[1]);
    const textMatches = [...combinedString.matchAll(/"text":"([^"]+)"/g)].map(m => m[1]);
    const weightMatches = [...combinedString.matchAll(/"weight":([\d.]+)/g)].map(m => parseFloat(m[1]));

    const count = Math.max(foodMatches.length, textMatches.length, weightMatches.length);
    const cleaned = [];

    for (let i = 0; i < count; i++) {
      cleaned.push({
        food: foodMatches[i] || textMatches[i] || 'Ingredient',
        text: textMatches[i] || foodMatches[i] || '',
        weight: weightMatches[i] || 100,
        measure: 'g',
        quantity: 1
      });
    }
    return cleaned;
  }

  return ingredientsArray;
}

function processMeals() {
  let rawData = fs.readFileSync(rawFilePath, 'utf-8').trim();

  // Fix truncated closing brackets if the raw JSON ended prematurely
  if (!rawData.endsWith(']')) {
    if (rawData.endsWith('}')) {
      rawData += ']';
    } else if (rawData.endsWith(',')) {
      rawData = rawData.slice(0, -1) + ']';
    } else {
      rawData += '}]';
    }
  }

  const rawMeals = JSON.parse(rawData);

  const cleanedMeals = rawMeals.map((meal, index) => {
    const cleanedIngredients = repairIngredients(meal.ingredients);

    // Placeholder macro calculation if set to 0 (approx. 4 kcal/g protein & carb, 9 kcal/g fat)
    const totalWeight = cleanedIngredients.reduce((acc, ing) => acc + (ing.weight || 0), 0);
    
    // Estimate baseline macros if missing/zeroed out
    const protein = meal.macros?.protein || Math.round(totalWeight * 0.08);
    const carbs = meal.macros?.carbs || Math.round(totalWeight * 0.15);
    const fat = meal.macros?.fat || Math.round(totalWeight * 0.04);
    const calories = meal.macros?.calories || (protein * 4 + carbs * 4 + fat * 9);

    return {
      id: meal.id || `meal-${String(index + 1).padStart(3, '0')}`,
      name: meal.name || 'Balanced Meal Option',
      budgetTier: meal.budgetTier || 1,
      costPerServingUSD: meal.costPerServingUSD || 2.50,
      prepTimeMinutes: meal.prepTimeMinutes || 15,
      macros: {
        calories: Math.round(calories),
        protein: Math.round(protein),
        carbs: Math.round(carbs),
        fat: Math.round(fat)
      },
      dietaryFlags: meal.dietaryFlags || {
        isHalal: true,
        isVegetarian: false,
        isDairyFree: true,
        isNutFree: true,
        isGlutenFree: true,
        isKosher: true
      },
      ingredients: cleanedIngredients,
      instructions: meal.instructions && meal.instructions !== "Combine ingredients and prepare."
        ? meal.instructions
        : "Prepare and portion ingredients as listed. Combine in a bowl or skillet and cook over medium heat until cooked through."
    };
  });

  // Ensure output directory exists and write cleaned file
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(cleanedMeals, null, 2));
  console.log(`Successfully cleaned ${cleanedMeals.length} records and saved to ${outputPath}`);
}

processMeals();
