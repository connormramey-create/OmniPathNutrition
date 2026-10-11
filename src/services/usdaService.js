// src/services/usdaService.js
const USDA_BASE_URL = 'https://api.nal.usda.gov/fdc/v1'; //[cite: 1]
const API_KEY = import.meta.env.VITE_USDA_API_KEY || 'DEMO_KEY'; //[cite: 1]

export async function searchUSDAFood(query) {
  const response = await fetch(
    `${USDA_BASE_URL}/foods/search?query=${encodeURIComponent(query)}&api_key=${API_KEY}` //[cite: 1]
  );
  if (!response.ok) throw new Error('USDA API Request Failed');
  const data = await response.json();
  return data.foods; // Returns items with macronutrients, UPCs, and fdcId[cite: 1]
}

export async function getUSDAFoodDetails(fdcId) {
  const response = await fetch(
    `${USDA_BASE_URL}/food/${fdcId}?api_key=${API_KEY}` //[cite: 1]
  );
  return await response.json();
}
