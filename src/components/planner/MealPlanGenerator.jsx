import React, { useMemo, useState } from 'react';
import {
  ACTIVITY_LEVELS,
  GOALS,
  MAX_PEOPLE,
  activePeople,
  createPerson,
  householdTargets,
  personLabel,
  validateHousehold
} from '../../utils/nutrition';
import { generateMealPlan } from '../../services/mealPlanGenerator';

const inputCls = 'w-full p-1.5 text-xs rounded border border-gray-600 bg-transparent';
const labelCls = 'text-[10px] font-bold uppercase block mb-1 opacity-80';

function PersonFields({ person, index, units, showName, canRemove, onChange, onRemove }) {
  const set = (field) => (e) => onChange({ ...person, [field]: e.target.value });
  const fid = (f) => `${person.id}-${f}`;

  return (
    <div className={showName ? 'op-stat p-3 space-y-2' : ''}>
      {showName && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor={fid('name')} className={labelCls}>Name</label>
            <input
              id={fid('name')}
              type="text"
              maxLength={30}
              value={person.name}
              placeholder={`Person ${index + 1}`}
              onChange={set('name')}
              className={inputCls}
            />
          </div>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-xs border border-gray-600 px-2 py-1.5 rounded text-red-400"
              aria-label={`Remove ${personLabel(person, index)}`}
            >
              Remove
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div>
          <label htmlFor={fid('sex')} className={labelCls}>Sex</label>
          <select id={fid('sex')} value={person.sex} onChange={set('sex')} className={inputCls}>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div>
          <label htmlFor={fid('age')} className={labelCls}>Age</label>
          <input id={fid('age')} type="number" min="18" max="100" value={person.age} onChange={set('age')} className={inputCls} />
        </div>
        {units === 'imperial' ? (
          <>
            <div>
              <label htmlFor={fid('weightLb')} className={labelCls}>Weight (lb)</label>
              <input id={fid('weightLb')} type="number" min="70" value={person.weightLb} onChange={set('weightLb')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Height</label>
              <div className="flex gap-1">
                <input type="number" min="4" max="7" value={person.heightFt} onChange={set('heightFt')} className={inputCls} aria-label="Feet" />
                <span className="text-xs self-center">ft</span>
                <input type="number" min="0" max="11" value={person.heightIn} onChange={set('heightIn')} className={inputCls} aria-label="Inches" />
                <span className="text-xs self-center">in</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <label htmlFor={fid('weightKg')} className={labelCls}>Weight (kg)</label>
              <input id={fid('weightKg')} type="number" min="35" value={person.weightKg} onChange={set('weightKg')} className={inputCls} />
            </div>
            <div>
              <label htmlFor={fid('heightCm')} className={labelCls}>Height (cm)</label>
              <input id={fid('heightCm')} type="number" min="120" value={person.heightCm} onChange={set('heightCm')} className={inputCls} />
            </div>
          </>
        )}
        <div className="col-span-2">
          <label htmlFor={fid('activity')} className={labelCls}>Activity Level</label>
          <select id={fid('activity')} value={person.activity} onChange={set('activity')} className={inputCls}>
            {ACTIVITY_LEVELS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={fid('goal')} className={labelCls}>Goal</label>
          <select id={fid('goal')} value={person.goal} onChange={set('goal')} className={inputCls}>
            {GOALS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

function TargetsRow({ name, targets }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-xs op-stat p-2">
      {name && <div className="font-bold self-center sm:text-left truncate">{name}</div>}
      <div><span className="block font-bold">Daily Calories</span>{targets.calories} kcal</div>
      <div><span className="block font-bold">Protein</span>{targets.protein} g</div>
      <div><span className="block font-bold">Carbs</span>{targets.carbs} g</div>
      <div><span className="block font-bold">Fat</span>{targets.fat} g</div>
      <div className={name ? '' : 'sm:col-span-2'}><span className="block font-bold">Pace</span>{targets.pace}</div>
      <div className="col-span-2 sm:col-span-6 text-[10px] opacity-70">
        BMR {targets.bmr} · Maintenance (TDEE) {targets.tdee} kcal · BMI {targets.bmi}
      </div>
    </div>
  );
}

export default function MealPlanGenerator({ profile, onProfileChange, meals, onApplyPlan, hasExistingPlan }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const household = Boolean(profile.householdEnabled);
  const shownPeople = activePeople(profile);
  const errors = useMemo(() => validateHousehold(profile), [profile]);
  const diners = useMemo(() => (errors.length ? null : householdTargets(profile)), [profile, errors]);

  const updatePerson = (id, next) =>
    onProfileChange({ ...profile, people: profile.people.map(p => (p.id === id ? next : p)) });

  const addPerson = () => {
    if (profile.people.length >= MAX_PEOPLE) return;
    const n = profile.people.length + 1;
    onProfileChange({ ...profile, householdEnabled: true, people: [...profile.people, createPerson({ name: `Person ${n}` })] });
  };

  const removePerson = (id) => onProfileChange({ ...profile, people: profile.people.filter(p => p.id !== id) });

  const toggleHousehold = () => {
    const turningOn = !household;
    // First time on: add a second person so there's something to fill in.
    const people = turningOn && profile.people.length < 2
      ? [...profile.people, createPerson({ name: 'Person 2', sex: 'female', weightLb: 145, heightFt: 5, heightIn: 5, weightKg: 66, heightCm: 165 })]
      : profile.people;
    onProfileChange({ ...profile, householdEnabled: turningOn, people });
    setResult(null);
  };

  const handleGenerate = () => {
    setError('');
    if (!diners) return;
    try {
      const out = generateMealPlan({
        meals,
        people: diners,
        weeklyBudget: Number(profile.weeklyBudget)
      });
      setResult(out);
      onApplyPlan(out.plan);
    } catch (err) {
      setError(err.message);
      setResult(null);
    }
  };

  const budget = Number(profile.weeklyBudget) || 0;

  return (
    <div className="op-card p-4 space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h2 className="op-heading text-lg font-bold">Meal Plan Generator</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs font-bold cursor-pointer">
            <input type="checkbox" checked={household} onChange={toggleHousehold} />
            Plan for multiple people
          </label>
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
      </div>

      {household && (
        <p className="text-[10px] opacity-70">
          Everyone shares the same recipes each day; portions are sized to each person&apos;s calorie and protein targets.
          The grocery list and budget cover the whole household.
        </p>
      )}

      <div className="space-y-3">
        {shownPeople.map((person, i) => (
          <PersonFields
            key={person.id}
            person={person}
            index={i}
            units={profile.units}
            showName={household}
            canRemove={household && shownPeople.length > 1 && i > 0}
            onChange={(next) => updatePerson(person.id, next)}
            onRemove={() => removePerson(person.id)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <label htmlFor="weeklyBudgetInput" className={labelCls}>{household ? 'Household Budget / wk ($)' : 'Weekly Budget ($)'}</label>
          <input
            id="weeklyBudgetInput"
            type="number"
            min="20"
            step="5"
            value={profile.weeklyBudget}
            onChange={(e) => onProfileChange({ ...profile, weeklyBudget: e.target.value })}
            className={inputCls}
          />
        </div>
        {household && profile.people.length < MAX_PEOPLE && (
          <button type="button" onClick={addPerson} className="text-xs border border-gray-600 px-3 py-1.5 rounded font-bold">
            + Add person
          </button>
        )}
        <span className="text-[10px] opacity-70 pb-1.5">
          Daily food budget ≈ ${(budget / 7).toFixed(2)}
          {household && shownPeople.length > 1 ? ` (≈ $${(budget / 7 / shownPeople.length).toFixed(2)}/person)` : ''}
        </span>
      </div>

      {errors.length > 0 && (
        <ul className="text-xs text-red-400 list-disc list-inside">
          {errors.map(e => <li key={e}>{e}</li>)}
        </ul>
      )}

      {diners && (
        <div className="space-y-2">
          {diners.map(d => (
            <TargetsRow key={d.id} name={household ? d.name : null} targets={d.targets} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!diners}
          className="px-4 py-2 text-xs font-bold op-btn-primary rounded disabled:opacity-50"
        >
          {result ? 'Regenerate Plan' : household ? `Generate 7-Day Plan for ${shownPeople.length}` : 'Generate 7-Day Plan'}
        </button>
        {hasExistingPlan && (
          <span className="text-[10px] opacity-70">Generating replaces the current weekly schedule.</span>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {result && (
        <div className="text-xs space-y-1 border-t border-gray-700 pt-3">
          {result.summary.people.map(p => (
            <p key={p.id}>
              <span className="font-bold">{result.summary.people.length > 1 ? `${p.name} average:` : 'Plan average:'}</span>{' '}
              {p.avg.calories} kcal · P {p.avg.protein}g · C {p.avg.carbs}g · F {p.avg.fat}g
              {result.summary.people.length > 1 && <span className="opacity-60"> (target {p.targets.calories} kcal)</span>}
            </p>
          ))}
          <p>
            <span className="font-bold">Estimated groceries:</span> ${result.summary.weeklyCost.toFixed(2)} of ${budget.toFixed(2)} budget
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
