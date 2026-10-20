import React, { useMemo, useState } from 'react';
import { ACTIVITY_LEVELS, GOALS, calculateTargets, validateProfile } from '../../utils/nutrition';
import { generateMealPlan } from '../../services/mealPlanGenerator';

const inputCls = 'w-full p-1.5 text-xs rounded border border-gray-600 bg-transparent';
const labelCls = 'text-[10px] font-bold uppercase block mb-1 opacity-80';

export default function MealPlanGenerator({ profile, onProfileChange, meals, onApplyPlan, hasExistingPlan }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const errors = useMemo(() => validateProfile(profile), [profile]);
  const targets = useMemo(() => (errors.length ? null : calculateTargets(profile)), [profile, errors]);

  const set = (field) => (e) => onProfileChange({ ...profile, [field]: e.target.value });

  const handleGenerate = () => {
    setError('');
    if (!targets) return;
    try {
      const out = generateMealPlan({
        meals,
        targets,
        weeklyBudget: Number(profile.weeklyBudget)
      });
      setResult(out);
      onApplyPlan(out.plan);
    } catch (err) {
      setError(err.message);
      setResult(null);
    }
  };

  return (
    <div className="op-card p-4 space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h2 className="op-heading text-lg font-bold">Meal Plan Generator</h2>
        <div className="flex text-[10px] font-bold op-segment overflow-hidden">
          {['imperial', 'metric'].map(u => (
            <button
              key={u}
              type="button"
              onClick={() => onProfileChange({ ...profile, units: u })}
              className={`px-2 py-1 ${profile.units === u ? 'op-btn-primary op-active' : ''}`}
            >
              {u === 'imperial' ? 'lb / ft' : 'kg / cm'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <div>
          <label className={labelCls}>Sex</label>
          <select value={profile.sex} onChange={set('sex')} className={inputCls}>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Age</label>
          <input type="number" min="18" max="100" value={profile.age} onChange={set('age')} className={inputCls} />
        </div>
        {profile.units === 'imperial' ? (
          <>
            <div>
              <label className={labelCls}>Weight (lb)</label>
              <input type="number" min="70" value={profile.weightLb} onChange={set('weightLb')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Height</label>
              <div className="flex gap-1">
                <input type="number" min="4" max="7" value={profile.heightFt} onChange={set('heightFt')} className={inputCls} aria-label="Feet" />
                <span className="text-xs self-center">ft</span>
                <input type="number" min="0" max="11" value={profile.heightIn} onChange={set('heightIn')} className={inputCls} aria-label="Inches" />
                <span className="text-xs self-center">in</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className={labelCls}>Weight (kg)</label>
              <input type="number" min="35" value={profile.weightKg} onChange={set('weightKg')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Height (cm)</label>
              <input type="number" min="120" value={profile.heightCm} onChange={set('heightCm')} className={inputCls} />
            </div>
          </>
        )}
        <div className="col-span-2">
          <label className={labelCls}>Activity Level</label>
          <select value={profile.activity} onChange={set('activity')} className={inputCls}>
            {ACTIVITY_LEVELS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Goal</label>
          <select value={profile.goal} onChange={set('goal')} className={inputCls}>
            {GOALS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Weekly Budget ($)</label>
          <input type="number" min="20" step="5" value={profile.weeklyBudget} onChange={set('weeklyBudget')} className={inputCls} />
        </div>
      </div>

      {errors.length > 0 && (
        <ul className="text-xs text-red-400 list-disc list-inside">
          {errors.map(e => <li key={e}>{e}</li>)}
        </ul>
      )}

      {targets && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs op-stat p-2">
          <div><span className="block font-bold">Daily Calories</span>{targets.calories} kcal</div>
          <div><span className="block font-bold">Protein</span>{targets.protein} g</div>
          <div><span className="block font-bold">Carbs</span>{targets.carbs} g</div>
          <div><span className="block font-bold">Fat</span>{targets.fat} g</div>
          <div><span className="block font-bold">Pace</span>{targets.pace}</div>
          <div className="col-span-2 sm:col-span-5 text-[10px] opacity-70">
            BMR {targets.bmr} · Maintenance (TDEE) {targets.tdee} kcal · BMI {targets.bmi} · Daily food budget ≈ ${(profile.weeklyBudget / 7).toFixed(2)}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!targets}
          className="px-4 py-2 text-xs font-bold op-btn-primary rounded disabled:opacity-50"
        >
          {result ? 'Regenerate Plan' : 'Generate 7-Day Plan'}
        </button>
        {hasExistingPlan && (
          <span className="text-[10px] opacity-70">Generating replaces the current weekly schedule.</span>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {result && (
        <div className="text-xs space-y-1 border-t border-gray-700 pt-3">
          <p>
            <span className="font-bold">Plan average:</span> {result.summary.avg.calories} kcal · P {result.summary.avg.protein}g ·
            C {result.summary.avg.carbs}g · F {result.summary.avg.fat}g
          </p>
          <p>
            <span className="font-bold">Estimated groceries:</span> ${result.summary.weeklyCost.toFixed(2)} of ${Number(profile.weeklyBudget).toFixed(2)} budget
          </p>
          {result.summary.warnings.map(w => <p key={w} className="text-yellow-400">⚠ {w}</p>)}
        </div>
      )}

      <p className="text-[10px] opacity-60">
        Targets use the Mifflin-St Jeor equation with safe rates of change (about 1 lb/week loss or 0.5 lb/week gain).
        Costs are estimates from average US prices, not live store prices. This is general guidance, not medical advice.
      </p>
    </div>
  );
}
