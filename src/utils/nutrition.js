// src/utils/nutrition.js
// Calorie & macro targets from body stats.
// BMR: Mifflin-St Jeor equation. TDEE = BMR × activity factor.
// Healthy rates of change:
//   lose     → ~500 kcal/day deficit (≈1 lb/week), capped at 25% of TDEE, never below
//              1,500 kcal (male) / 1,200 kcal (female)
//   gain     → ~300 kcal/day surplus (≈0.5 lb/week, lean-gain pace)
//   maintain → TDEE
// Protein: 1.8 g/kg (lose), 1.6 g/kg (maintain), 1.8 g/kg (gain). For BMI ≥ 30 it is
// based on the weight at BMI 25 so targets stay realistic. Fat: 28% of calories.
// Carbs: the remainder. Not medical advice.
//
// Household: a profile can hold several people (see normalizeProfile). Targets are
// calculated per person; the weekly budget is shared.

export const ACTIVITY_LEVELS = [
  { id: 'sedentary', label: 'Sedentary (little or no exercise)', factor: 1.2 },
  { id: 'light', label: 'Lightly active (1–3 days/week)', factor: 1.375 },
  { id: 'moderate', label: 'Moderately active (3–5 days/week)', factor: 1.55 },
  { id: 'very', label: 'Very active (6–7 days/week)', factor: 1.725 },
  { id: 'extra', label: 'Extra active (physical job + training)', factor: 1.9 }
];

export const GOALS = [
  { id: 'lose', label: 'Lose weight' },
  { id: 'maintain', label: 'Maintain' },
  { id: 'gain', label: 'Gain weight' }
];

// ---------- People & household ----------
// A profile holds shared settings (units, weekly budget, household toggle) and a list of
// people. people[0] is the primary person; when householdEnabled is on, everyone in
// `people` is planned for, sharing the same recipes with individually sized portions.

export const MAX_PEOPLE = 6;

const PERSON_FIELDS = ['name', 'sex', 'age', 'weightLb', 'heightFt', 'heightIn', 'weightKg', 'heightCm', 'activity', 'goal'];

export const DEFAULT_PERSON = {
  name: 'Me',
  sex: 'male',
  age: 30,
  weightLb: 180,
  heightFt: 5,
  heightIn: 10,
  weightKg: 82,
  heightCm: 178,
  activity: 'moderate',
  goal: 'maintain'
};

let personSeq = 0;
export function newPersonId() {
  personSeq += 1;
  return `p-${Date.now().toString(36)}-${personSeq}`;
}

export function createPerson(overrides = {}) {
  return { ...DEFAULT_PERSON, id: newPersonId(), ...overrides };
}

export const DEFAULT_PROFILE = {
  units: 'imperial', // 'imperial' | 'metric'
  weeklyBudget: 100, // whole household when householdEnabled
  householdEnabled: false,
  people: [{ ...DEFAULT_PERSON, id: 'p-primary' }]
};

/**
 * Upgrades saved profiles to the household shape. Older versions stored one person's
 * stats directly on the profile (profile.sex, profile.age, …) – those become people[0].
 */
export function normalizeProfile(raw = {}) {
  const p = raw || {};
  let people = Array.isArray(p.people) ? p.people.filter(Boolean) : [];
  if (people.length === 0) {
    const legacy = {};
    PERSON_FIELDS.forEach(f => { if (p[f] !== undefined) legacy[f] = p[f]; });
    people = [{ ...DEFAULT_PERSON, ...legacy, id: 'p-primary' }];
  }
  people = people.slice(0, MAX_PEOPLE).map((person, i) => ({
    ...DEFAULT_PERSON,
    ...person,
    id: person.id || (i === 0 ? 'p-primary' : newPersonId()),
    name: person.name ?? (i === 0 ? 'Me' : `Person ${i + 1}`)
  }));
  return {
    units: p.units === 'metric' ? 'metric' : 'imperial',
    weeklyBudget: p.weeklyBudget ?? DEFAULT_PROFILE.weeklyBudget,
    householdEnabled: Boolean(p.householdEnabled),
    people
  };
}

/** People the planner should cover right now (just the primary person unless household is on). */
export function activePeople(profile) {
  const people = profile?.people || [];
  return profile?.householdEnabled ? people : people.slice(0, 1);
}

export function personLabel(person, index = 0) {
  return (person?.name || '').trim() || `Person ${index + 1}`;
}

/** Merge the shared unit setting into a person so the per-person helpers can read it. */
export const withUnits = (profile, person) => ({ ...person, units: profile.units });

/** Budget check plus per-person stat checks, prefixed with the person's name when planning for several. */
export function validateHousehold(profile) {
  const errors = [];
  const people = activePeople(profile);
  if (people.length === 0) errors.push('Add at least one person.');
  people.forEach((person, i) => {
    validatePerson(withUnits(profile, person)).forEach(e =>
      errors.push(people.length > 1 ? `${personLabel(person, i)}: ${e}` : e)
    );
  });
  const budget = Number(profile.weeklyBudget);
  const minBudget = 20 * Math.max(1, people.length);
  if (!budget || budget < minBudget) {
    errors.push(people.length > 1
      ? `Weekly budget must be at least $${minBudget} for ${people.length} people.`
      : 'Weekly budget must be at least $20.');
  }
  return errors;
}

/** [{ id, name, targets }] for every active person, or null if any input is invalid. */
export function householdTargets(profile) {
  if (validateHousehold(profile).length) return null;
  return activePeople(profile).map((person, i) => ({
    id: person.id,
    name: personLabel(person, i),
    targets: calculateTargets(withUnits(profile, person))
  }));
}

export function profileToMetric(p) {
  if (p.units === 'metric') {
    return { weightKg: Number(p.weightKg), heightCm: Number(p.heightCm) };
  }
  return {
    weightKg: Number(p.weightLb) * 0.453592,
    heightCm: (Number(p.heightFt) * 12 + Number(p.heightIn || 0)) * 2.54
  };
}

// Checks one person's stats (pass a person merged with `units`, see withUnits).
export function validatePerson(p) {
  const errors = [];
  const { weightKg, heightCm } = profileToMetric(p);
  const age = Number(p.age);
  if (!age || age < 18 || age > 100) errors.push('Age must be between 18 and 100 (these equations are for adults).');
  if (!weightKg || weightKg < 35 || weightKg > 300) errors.push('Enter a realistic weight.');
  if (!heightCm || heightCm < 120 || heightCm > 230) errors.push('Enter a realistic height.');
  return errors;
}

// Kept for older callers: validates the primary person plus the budget.
export function validateProfile(p) {
  return validateHousehold(normalizeProfile(p));
}

export function calculateTargets(p) {
  const { weightKg, heightCm } = profileToMetric(p);
  const age = Number(p.age);
  const isMale = p.sex !== 'female';

  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (isMale ? 5 : -161);
  const factor = ACTIVITY_LEVELS.find(a => a.id === p.activity)?.factor ?? 1.55;
  const tdee = bmr * factor;

  let calories = tdee;
  let pace = 'Maintain current weight';
  if (p.goal === 'lose') {
    const deficit = Math.min(500, tdee * 0.25);
    const floor = isMale ? 1500 : 1200;
    calories = Math.max(floor, tdee - deficit);
    const lbPerWeek = ((tdee - calories) * 7) / 3500;
    pace = `≈${lbPerWeek.toFixed(1)} lb/week loss`;
  } else if (p.goal === 'gain') {
    calories = tdee + 300;
    pace = '≈0.5 lb/week gain';
  }
  calories = Math.round(calories / 10) * 10;

  const bmi = weightKg / (heightCm / 100) ** 2;
  const proteinBaseKg = bmi >= 30 ? 25 * (heightCm / 100) ** 2 : weightKg;
  const proteinPerKg = p.goal === 'maintain' ? 1.6 : 1.8;
  const protein = Math.round(proteinBaseKg * proteinPerKg);
  const fat = Math.round((calories * 0.28) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calories,
    protein,
    carbs,
    fat,
    bmi: Math.round(bmi * 10) / 10,
    pace
  };
}
