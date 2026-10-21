// src/services/mealPlanGenerator.js
// Builds a 7-day plan (Breakfast / Lunch / Dinner / Snack) that aims for the daily
// calorie + macro targets while keeping estimated grocery cost within the weekly budget.
//
// Household mode: everyone eats the same recipe in each slot, but each person gets their
// own portion size. The plan is scored against every person's targets, and the combined
// grocery cost is checked against one shared weekly budget.
//
// Approach: for each day, sample many random combinations from the eligible recipe
// pools, scale each recipe's servings per person (0.5–3, in 0.25 steps) to hit that
// slot's share of their calories, score each combination, and keep the best. Recipes
// aren't repeated within the week unless the pool runs out.

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SLOT_SHARE = { Breakfast: 0.25, Lunch: 0.32, Dinner: 0.33, Snack: 0.10 };
const SLOTS = Object.keys(SLOT_SHARE);
const TRIALS_PER_DAY = 600;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const quarter = v => Math.round(v * 4) / 4;
const emptyTotals = () => ({ calories: 0, protein: 0, carbs: 0, fat: 0, cost: 0 });

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

// How well one person's day matches their targets (lower is better).
function scoreNutrition(totals, targets) {
  const calErr = Math.abs(totals.calories - targets.calories) / targets.calories;
  const proteinShort = Math.max(0, targets.protein - totals.protein) / targets.protein;
  const proteinOver = Math.max(0, totals.protein - targets.protein * 1.35) / targets.protein;
  const fatErr = Math.abs(totals.fat - targets.fat) / Math.max(1, targets.fat);
  const carbErr = Math.abs(totals.carbs - targets.carbs) / Math.max(1, targets.carbs);
  return 4 * calErr + 5 * proteinShort + 1 * proteinOver + 1 * fatErr + 0.6 * carbErr;
}

// Combined grocery cost for the day vs. the shared daily budget.
function scoreBudget(cost, dailyBudget) {
  const overBudget = Math.max(0, cost - dailyBudget) / dailyBudget;
  return 6 * overBudget + 0.15 * (cost / dailyBudget); // gentle preference for cheaper days
}

/**
 * @param {object} opts
 * @param {Array}  opts.meals        recipes already passed through prepareMeal()
 * @param {Array}  [opts.people]     [{ id, name, targets }] – everyone sharing the plan
 * @param {object} [opts.targets]    single-person shortcut: { calories, protein, carbs, fat }
 * @param {number} opts.weeklyBudget USD for the whole household
 * @param {number} [opts.seed]
 * @returns {{ plan: Array, summary: object }}
 *
 * Each plan entry has `servings` (total servings to cook, used for groceries/cost) and
 * `portions` ([{ personId, name, servings }]) showing how that splits between people.
 */
export function generateMealPlan({ meals, people, targets, weeklyBudget, seed = Date.now() }) {
  const diners = people?.length ? people : [{ id: 'p-primary', name: 'Me', targets }];
  if (!diners.every(d => d.targets?.calories)) throw new Error('Missing calorie targets.');

  const rand = mulberry32(seed);
  const dailyBudget = weeklyBudget / 7;

  // Per person, per slot: calories that slot should provide.
  const slotCalories = (diner, slot) => diner.targets.calories * SLOT_SHARE[slot];
  const portionsFor = (meal, slot) => diners.map(d => servingsFor(meal, slotCalories(d, slot)));

  const pools = {};
  for (const slot of SLOTS) {
    const slotBudget = dailyBudget * SLOT_SHARE[slot];
    pools[slot] = meals.filter(m => {
      if (!m.slots?.includes(slot) || !m.perServing?.calories) return false;
      // Drop recipes whose cost for everyone's portions would blow the slot budget 3×.
      const totalServings = portionsFor(m, slot).reduce((a, b) => a + b, 0);
      return m.costPerServing * totalServings <= slotBudget * 3;
    });
    if (pools[slot].length === 0) {
      pools[slot] = meals.filter(m => m.slots?.includes(slot) && m.perServing?.calories);
    }
  }

  const missing = SLOTS.filter(s => pools[s].length === 0);
  if (missing.length) {
    throw new Error(`Not enough recipes match your filters for: ${missing.join(', ')}. Try removing a dietary filter.`);
  }

  const used = new Set();
  const plan = [];
  const dayTotals = []; // [{ day, cost, people: [{ id, calories, protein, carbs, fat }] }]

  for (const day of DAYS) {
    let best = null;
    for (let t = 0; t < TRIALS_PER_DAY; t++) {
      const picks = [];
      const perPerson = diners.map(emptyTotals);
      let cost = 0;
      let repeats = 0;
      for (const slot of SLOTS) {
        const pool = pools[slot];
        const meal = pool[Math.floor(rand() * pool.length)];
        if (used.has(meal.id) || picks.some(p => p.meal.id === meal.id)) repeats++;
        const portions = portionsFor(meal, slot);
        picks.push({ slot, meal, portions });
        portions.forEach((s, i) => {
          const tot = perPerson[i];
          tot.calories += meal.perServing.calories * s;
          tot.protein += meal.perServing.protein * s;
          tot.carbs += meal.perServing.carbs * s;
          tot.fat += meal.perServing.fat * s;
          tot.cost += meal.costPerServing * s;
          cost += meal.costPerServing * s;
        });
      }
      // Average nutrition score across people so adding someone doesn't drown out the budget term.
      const nutrition = perPerson.reduce((sum, tot, i) => sum + scoreNutrition(tot, diners[i].targets), 0) / diners.length;
      const score = nutrition + scoreBudget(cost, dailyBudget) + repeats * 0.5;
      if (!best || score < best.score) best = { score, picks, perPerson, cost };
    }

    best.picks.forEach(({ slot, meal, portions }) => {
      used.add(meal.id);
      plan.push({
        id: `gen-${day}-${slot}-${meal.id}-${Math.floor(rand() * 1e9)}`,
        day,
        slot,
        mealId: meal.id,
        servings: portions.reduce((a, b) => a + b, 0),
        portions: diners.map((d, i) => ({ personId: d.id, name: d.name, servings: portions[i] })),
        generated: true,
        mealData: meal
      });
    });
    dayTotals.push({ day, cost: best.cost, people: diners.map((d, i) => ({ id: d.id, ...best.perPerson[i] })) });
  }

  const weeklyCost = Math.round(dayTotals.reduce((a, d) => a + d.cost, 0) * 100) / 100;

  const peopleSummary = diners.map((d, i) => {
    const week = dayTotals.reduce((a, day) => {
      const t = day.people[i];
      return { calories: a.calories + t.calories, protein: a.protein + t.protein, carbs: a.carbs + t.carbs, fat: a.fat + t.fat };
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
    return {
      id: d.id,
      name: d.name,
      targets: d.targets,
      avg: {
        calories: Math.round(week.calories / 7),
        protein: Math.round(week.protein / 7),
        carbs: Math.round(week.carbs / 7),
        fat: Math.round(week.fat / 7)
      }
    };
  });

  const warnings = [];
  const who = p => (diners.length > 1 ? `${p.name}: ` : '');
  peopleSummary.forEach(p => {
    if (Math.abs(p.avg.calories - p.targets.calories) / p.targets.calories > 0.1) {
      warnings.push(`${who(p)}Average calories are more than 10% off target with the recipes available.`);
    }
    if (p.avg.protein < p.targets.protein * 0.85) {
      warnings.push(`${who(p)}Protein is below target. Try a higher budget, or add high-protein custom recipes.`);
    }
  });
  if (weeklyCost > weeklyBudget) {
    warnings.push(`Estimated cost ($${weeklyCost.toFixed(2)}) is over your $${weeklyBudget} budget. The cheapest matching recipes were used.`);
  }

  return {
    plan,
    summary: {
      avg: peopleSummary[0].avg, // primary person (kept for single-person callers)
      people: peopleSummary,
      weeklyCost,
      dayTotals,
      warnings
    }
  };
}

/** Servings of a plan entry eaten by one person. Entries without portions count for the primary person. */
export function personServings(entry, personId, primaryId) {
  if (Array.isArray(entry.portions) && entry.portions.length) {
    return entry.portions.find(p => p.personId === personId)?.servings || 0;
  }
  return personId === primaryId ? entry.servings || 1 : 0;
}

/** Nutrition totals for one person across some plan entries. */
export function personPlanTotals(plan, personId, primaryId) {
  const t = emptyTotals();
  plan.forEach(e => {
    const m = e.mealData;
    if (!m?.perServing) return;
    const s = personServings(e, personId, primaryId);
    t.calories += m.perServing.calories * s;
    t.protein += m.perServing.protein * s;
    t.carbs += m.perServing.carbs * s;
    t.fat += m.perServing.fat * s;
    t.cost += (m.costPerServing || 0) * s;
  });
  return t;
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
