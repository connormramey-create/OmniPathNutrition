// src/services/mealPlanGenerator.js
// Builds a 7-day plan (Breakfast / Lunch / Dinner / Snack) that aims for the daily
// calorie + macro targets while keeping estimated grocery cost within the weekly budget.
//
// Approach: for each day, sample many random combinations from the eligible recipe
// pools, scale each recipe's servings (0.5–3, in 0.25 steps) to hit that slot's share
// of calories, score each combination, and keep the best. Recipes aren't repeated
// within the week unless the pool runs out.

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SLOT_SHARE = { Breakfast: 0.25, Lunch: 0.32, Dinner: 0.33, Snack: 0.10 };
const SLOTS = Object.keys(SLOT_SHARE);
const TRIALS_PER_DAY = 600;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const quarter = v => Math.round(v * 4) / 4;

// Small seeded RNG so "Regenerate" gives a new plan but results are reproducible in tests.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function servingsFor(meal, slotCalories) {
  const per = meal.perServing.calories || 1;
  return clamp(quarter(slotCalories / per), 0.5, 3);
}

function scoreDay(totals, targets, dailyBudget) {
  const calErr = Math.abs(totals.calories - targets.calories) / targets.calories;
  const proteinShort = Math.max(0, targets.protein - totals.protein) / targets.protein;
  const proteinOver = Math.max(0, totals.protein - targets.protein * 1.35) / targets.protein;
  const fatErr = Math.abs(totals.fat - targets.fat) / Math.max(1, targets.fat);
  const carbErr = Math.abs(totals.carbs - targets.carbs) / Math.max(1, targets.carbs);
  const overBudget = Math.max(0, totals.cost - dailyBudget) / dailyBudget;
  return (
    4 * calErr +
    5 * proteinShort +
    1 * proteinOver +
    1 * fatErr +
    0.6 * carbErr +
    6 * overBudget +
    0.15 * (totals.cost / dailyBudget) // gentle preference for cheaper days
  );
}

/**
 * @param {object} opts
 * @param {Array}  opts.meals        recipes already passed through prepareMeal()
 * @param {object} opts.targets      { calories, protein, carbs, fat }
 * @param {number} opts.weeklyBudget USD
 * @param {number} [opts.seed]
 * @returns {{ plan: Array, summary: object }}
 */
export function generateMealPlan({ meals, targets, weeklyBudget, seed = Date.now() }) {
  const rand = mulberry32(seed);
  const dailyBudget = weeklyBudget / 7;

  const pools = {};
  for (const slot of SLOTS) {
    const share = SLOT_SHARE[slot];
    const slotCal = targets.calories * share;
    const slotBudget = dailyBudget * share;
    pools[slot] = meals.filter(m => {
      if (!m.slots?.includes(slot) || !m.perServing?.calories) return false;
      // Drop recipes whose cost at the needed portion would blow the slot budget 3×.
      return m.costPerServing * servingsFor(m, slotCal) <= slotBudget * 3;
    });
    if (pools[slot].length === 0) {
      pools[slot] = meals.filter(m => m.slots?.includes(slot));
    }
  }

  const missing = SLOTS.filter(s => pools[s].length === 0);
  if (missing.length) {
    throw new Error(`Not enough recipes match your filters for: ${missing.join(', ')}. Try removing a dietary filter.`);
  }

  const used = new Set();
  const plan = [];
  const dayTotals = [];

  for (const day of DAYS) {
    let best = null;
    for (let t = 0; t < TRIALS_PER_DAY; t++) {
      const picks = [];
      const totals = { calories: 0, protein: 0, carbs: 0, fat: 0, cost: 0 };
      let repeats = 0;
      for (const slot of SLOTS) {
        const pool = pools[slot];
        const meal = pool[Math.floor(rand() * pool.length)];
        if (used.has(meal.id) || picks.some(p => p.meal.id === meal.id)) repeats++;
        const servings = servingsFor(meal, targets.calories * SLOT_SHARE[slot]);
        picks.push({ slot, meal, servings });
        totals.calories += meal.perServing.calories * servings;
        totals.protein += meal.perServing.protein * servings;
        totals.carbs += meal.perServing.carbs * servings;
        totals.fat += meal.perServing.fat * servings;
        totals.cost += meal.costPerServing * servings;
      }
      const score = scoreDay(totals, targets, dailyBudget) + repeats * 0.5;
      if (!best || score < best.score) best = { score, picks, totals };
    }

    best.picks.forEach(({ slot, meal, servings }) => {
      used.add(meal.id);
      plan.push({
        id: `gen-${day}-${slot}-${meal.id}-${Math.floor(rand() * 1e9)}`,
        day,
        slot,
        mealId: meal.id,
        servings,
        generated: true,
        mealData: meal
      });
    });
    dayTotals.push({ day, ...best.totals });
  }

  const week = dayTotals.reduce(
    (a, d) => ({
      calories: a.calories + d.calories,
      protein: a.protein + d.protein,
      carbs: a.carbs + d.carbs,
      fat: a.fat + d.fat,
      cost: a.cost + d.cost
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, cost: 0 }
  );

  const avg = {
    calories: Math.round(week.calories / 7),
    protein: Math.round(week.protein / 7),
    carbs: Math.round(week.carbs / 7),
    fat: Math.round(week.fat / 7)
  };
  const weeklyCost = Math.round(week.cost * 100) / 100;

  const warnings = [];
  if (Math.abs(avg.calories - targets.calories) / targets.calories > 0.1) {
    warnings.push('Average calories are more than 10% off target with the recipes available.');
  }
  if (avg.protein < targets.protein * 0.85) {
    warnings.push('Protein is below target. Try a higher budget, or add high-protein custom recipes.');
  }
  if (weeklyCost > weeklyBudget) {
    warnings.push(`Estimated cost ($${weeklyCost.toFixed(2)}) is over your $${weeklyBudget} budget. The cheapest matching recipes were used.`);
  }

  return { plan, summary: { avg, weeklyCost, dayTotals, warnings } };
}

/** Totals for an arbitrary plan (used to show "current plan vs target"). */
export function planTotals(plan) {
  const t = { calories: 0, protein: 0, carbs: 0, fat: 0, cost: 0 };
  plan.forEach(e => {
    const m = e.mealData;
    if (!m?.perServing) return;
    const s = e.servings || 1;
    t.calories += m.perServing.calories * s;
    t.protein += m.perServing.protein * s;
    t.carbs += m.perServing.carbs * s;
    t.fat += m.perServing.fat * s;
    t.cost += (m.costPerServing || 0) * s;
  });
  return t;
}
