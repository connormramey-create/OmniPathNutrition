// src/utils/usdaPortions.js
// Turns USDA FoodData Central records (search results OR full detail records)
// into serving-size options and per-100 g macros.

const GENERIC_UNITS = [
  { id: 'g', label: 'g', grams: 1 },
  { id: 'oz', label: 'oz', grams: 28.3495 },
  { id: 'lb', label: 'lb', grams: 453.592 },
  { id: '100g', label: '100 g', grams: 100 }
];

const round = (n, d = 0) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

function normalizeUnit(u = '') {
  const s = String(u).toLowerCase();
  if (['g', 'grm', 'gram', 'grams'].includes(s)) return 'g';
  if (['ml', 'mlt', 'milliliter', 'milliliters'].includes(s)) return 'ml';
  return s;
}

/**
 * Returns serving options: [{ id, label, grams }]
 * Food-specific portions (cups, slices, servings...) come first, then generic units.
 */
export function getPortionOptions(food) {
  if (!food) return GENERIC_UNITS;
  const specific = [];
  const seen = new Set();
  const push = (label, grams) => {
    if (!grams || grams <= 0 || !label) return;
    const clean = label.trim();
    const key = `${clean.toLowerCase()}|${round(grams, 1)}`;
    if (seen.has(key)) return;
    seen.add(key);
    specific.push({ id: `p${specific.length}`, label: `${clean} (${round(grams, 1)} g)`, grams });
  };

  // Branded foods: label serving size
  if (food.servingSize) {
    const unit = normalizeUnit(food.servingSizeUnit);
    if (unit === 'g' || unit === 'ml') {
      const household = food.householdServingFullText ? `${food.householdServingFullText}` : '1 serving';
      push(household + (unit === 'ml' ? ' (≈)' : ''), Number(food.servingSize));
    }
  }

  // Search results: foodMeasures
  (food.foodMeasures || [])
    .slice()
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    .forEach(m => {
      if (m.disseminationText && !/^quantity not specified$/i.test(m.disseminationText)) {
        push(m.disseminationText, m.gramWeight);
      }
    });

  // Full detail records: foodPortions
  (food.foodPortions || []).forEach(p => {
    let label = p.portionDescription;
    if (!label || /^quantity not specified$/i.test(label)) {
      const amt = p.amount ?? p.value ?? 1;
      const unitName = p.measureUnit?.name && p.measureUnit.name !== 'undetermined' ? p.measureUnit.name : '';
      label = [amt, unitName, p.modifier].filter(Boolean).join(' ');
    }
    push(label, p.gramWeight);
  });

  return [...specific, ...GENERIC_UNITS];
}

export function getDefaultPortion(food) {
  const options = getPortionOptions(food);
  const firstSpecific = options.find(o => o.id.startsWith('p'));
  return firstSpecific
    ? { portionId: firstSpecific.id, qty: 1, options }
    : { portionId: '100g', qty: 1, options };
}

// Nutrient IDs / legacy numbers used by FDC
const NUTRIENTS = {
  calories: { ids: [1008], numbers: ['208'], unit: 'kcal' },
  caloriesAtwater: { ids: [2048, 2047], numbers: ['958', '957'], unit: 'kcal' },
  protein: { ids: [1003], numbers: ['203'] },
  fat: { ids: [1004], numbers: ['204'] },
  carbs: { ids: [1005], numbers: ['205'] }
};

function findNutrient(food, spec) {
  const list = food?.foodNutrients || [];
  for (const n of list) {
    const id = n.nutrientId ?? n.nutrient?.id;
    const num = String(n.nutrientNumber ?? n.nutrient?.number ?? '');
    const unit = String(n.unitName ?? n.nutrient?.unitName ?? '').toLowerCase();
    if (spec.unit === 'kcal' && unit && unit !== 'kcal') continue;
    if (spec.ids.includes(id) || spec.numbers.includes(num)) {
      const v = n.value ?? n.amount;
      if (typeof v === 'number') return v;
    }
  }
  return null;
}

/** Macros per 100 g: { calories, protein, carbs, fat } */
export function getMacrosPer100g(food) {
  const protein = findNutrient(food, NUTRIENTS.protein) ?? 0;
  const fat = findNutrient(food, NUTRIENTS.fat) ?? 0;
  const carbs = findNutrient(food, NUTRIENTS.carbs) ?? 0;
  let calories = findNutrient(food, NUTRIENTS.calories) ?? findNutrient(food, NUTRIENTS.caloriesAtwater);
  if (calories == null) calories = protein * 4 + carbs * 4 + fat * 9;
  return { calories, protein, carbs, fat };
}

export function scaleMacros(per100g, grams) {
  const f = (grams || 0) / 100;
  return {
    calories: Math.round((per100g?.calories || 0) * f),
    protein: round((per100g?.protein || 0) * f, 1),
    carbs: round((per100g?.carbs || 0) * f, 1),
    fat: round((per100g?.fat || 0) * f, 1)
  };
}

export function sumMacros(list) {
  return list.reduce(
    (acc, m) => ({
      calories: acc.calories + (m.calories || 0),
      protein: acc.protein + (m.protein || 0),
      carbs: acc.carbs + (m.carbs || 0),
      fat: acc.fat + (m.fat || 0)
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

/** Short shoppable name, e.g. "Chicken, breast, raw" -> "chicken breast" */
export function shoppableName(description = '') {
  const parts = description.split(',').map(s => s.trim()).filter(Boolean);
  const drop = /^(raw|cooked|boneless|skinless|meat only|without skin|with skin|fresh|frozen|unprepared|prepared|ns as to.*|nfs|upc.*|gtin.*)$/i;
  const kept = parts.filter((p, i) => i === 0 || !drop.test(p)).slice(0, 2);
  return kept.join(' ').toLowerCase();
}

/**
 * Build a recipe ingredient from a USDA food + chosen portion.
 * amount/unit are stored in grams so the grocery aggregator can sum them.
 */
export function buildUsdaIngredient(food, portionId, qty) {
  const options = getPortionOptions(food);
  const portion = options.find(o => o.id === portionId) || options.find(o => o.id === '100g');
  const quantity = Math.max(0, Number(qty) || 0);
  const grams = round(portion.grams * quantity, 1);
  return {
    fdcId: food.fdcId,
    name: food.description || food.name || 'USDA Ingredient',
    food: shoppableName(food.description || food.name || ''),
    qty: quantity,
    portionId: portion.id,
    portionLabel: portion.label,
    portionOptions: options,
    amount: grams,
    unit: 'g',
    per100g: getMacrosPer100g(food)
  };
}

/** Re-compute an ingredient after the user edits its qty or serving. */
export function updateIngredientPortion(ing, { qty = ing.qty, portionId = ing.portionId }) {
  const options = ing.portionOptions || GENERIC_UNITS;
  const portion = options.find(o => o.id === portionId) || options[0];
  const quantity = Math.max(0, Number(qty) || 0);
  return {
    ...ing,
    qty: quantity,
    portionId: portion.id,
    portionLabel: portion.label,
    amount: round(portion.grams * quantity, 1)
  };
}
