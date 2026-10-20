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

export const DEFAULT_PROFILE = {
  units: 'imperial', // 'imperial' | 'metric'
  sex: 'male',
  age: 30,
  weightLb: 180,
  heightFt: 5,
  heightIn: 10,
  weightKg: 82,
  heightCm: 178,
  activity: 'moderate',
  goal: 'maintain',
  weeklyBudget: 100
};

export function profileToMetric(p) {
  if (p.units === 'metric') {
    return { weightKg: Number(p.weightKg), heightCm: Number(p.heightCm) };
  }
  return {
    weightKg: Number(p.weightLb) * 0.453592,
    heightCm: (Number(p.heightFt) * 12 + Number(p.heightIn || 0)) * 2.54
  };
}

export function validateProfile(p) {
  const errors = [];
  const { weightKg, heightCm } = profileToMetric(p);
  const age = Number(p.age);
  if (!age || age < 18 || age > 100) errors.push('Age must be between 18 and 100 (these equations are for adults).');
  if (!weightKg || weightKg < 35 || weightKg > 300) errors.push('Enter a realistic weight.');
  if (!heightCm || heightCm < 120 || heightCm > 230) errors.push('Enter a realistic height.');
  if (!Number(p.weeklyBudget) || Number(p.weeklyBudget) < 20) errors.push('Weekly budget must be at least $20.');
  return errors;
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
