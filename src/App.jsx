import React, { useState, useEffect, useMemo } from 'react';
import mealsData from './data/meals_400.json';
import dietaryFlagsList from './data/dietary_flags.json';
import { searchUSDAFood } from './services/usdaService';
import { exportMealPlanToWord } from './services/exportService';
import { consolidateGroceryList } from './services/groceryAggregator';
import { 
  generatePublixInstacartLink, 
  generateWalmartSearchLink, 
  generateKrogerSearchLink 
} from './services/retailService';
import { saveUserData, getUserData } from './services/dbService';
import ThemeSwitcher from './components/ui/ThemeSwitcher';
import AuthModal from './components/auth/AuthModal';
import { auth } from './config/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

export default function App() {
  const [theme, setTheme] = useState('standard');
  const [user, setUser] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [goalMode, setGoalMode] = useState('maintain');
  const [budgetTier, setBudgetTier] = useState(1);
  const [activeFlags, setActiveFlags] = useState([]);
  
  // Recipe & Meal Plan State
  const [customRecipes, setCustomRecipes] = useState([]);
  const [weeklyPlan, setWeeklyPlan] = useState([]); // [{ id, day, slot, mealId, mealData }]
  const [searchTerm, setSearchTerm] = useState('');

  // USDA Builder State
  const [usdaQuery, setUsdaQuery] = useState('');
  const [usdaResults, setUsdaResults] = useState([]);
  const [newRecipeTitle, setNewRecipeTitle] = useState('');
  const [newRecipeIngredients, setNewRecipeIngredients] = useState([]);

  // Authenticated State Sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const cloudData = await getUserData(currentUser.uid);
        if (cloudData) {
          if (cloudData.theme) {
            setTheme(cloudData.theme);
            document.documentElement.setAttribute('data-theme', cloudData.theme);
          }
          if (cloudData.goalMode) setGoalMode(cloudData.goalMode);
          if (cloudData.budgetTier) setBudgetTier(cloudData.budgetTier);
          if (cloudData.activeFlags) setActiveFlags(cloudData.activeFlags);
          if (cloudData.customRecipes) setCustomRecipes(cloudData.customRecipes);
          if (cloudData.weeklyPlan) setWeeklyPlan(cloudData.weeklyPlan);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const syncToCloud = (updatedState = {}) => {
    if (!user) return;
    saveUserData(user.uid, {
      theme,
      goalMode,
      budgetTier,
      activeFlags,
      customRecipes,
      weeklyPlan,
      ...updatedState
    });
  };

  // Combine Starter Meals + Custom User Recipes
  const allAvailableMeals = useMemo(() => {
    return [...customRecipes, ...mealsData];
  }, [customRecipes]);

  // Filter Meals
  const filteredMeals = useMemo(() => {
    return allAvailableMeals.filter(meal => {
      if (meal.budgetTier && meal.budgetTier > budgetTier) return false;
      for (let flag of activeFlags) {
        if (meal.dietaryFlags && !meal.dietaryFlags[flag]) return false;
      }
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const titleMatch = meal.name.toLowerCase().includes(query);
        const ingredientMatch = meal.ingredients?.some(i => (i.name || i.food || '').toLowerCase().includes(query));
        if (!titleMatch && !ingredientMatch) return false;
      }
      return true;
    });
  }, [allAvailableMeals, budgetTier, activeFlags, searchTerm]);

  // Add Meal to Specific Day & Slot
  const handleAddMealToSlot = (meal, day, slot) => {
    const entry = {
      id: `slot-${Date.now()}-${Math.random()}`,
      day,
      slot,
      mealId: meal.id,
      mealData: meal
    };
    const updatedPlan = [...weeklyPlan, entry];
    setWeeklyPlan(updatedPlan);
    syncToCloud({ weeklyPlan: updatedPlan });
  };

  const handleRemoveFromSlot = (entryId) => {
    const updatedPlan = weeklyPlan.filter(item => item.id !== entryId);
    setWeeklyPlan(updatedPlan);
    syncToCloud({ weeklyPlan: updatedPlan });
  };

  // USDA Ingredient Search for Custom Recipe Builder
  const handleUSDASearch = async (e) => {
    e.preventDefault();
    if (!usdaQuery.trim()) return;
    try {
      const results = await searchUSDAFood(usdaQuery);
      setUsdaResults(results || []);
    } catch (err) {
      console.error('USDA Search failed:', err);
    }
  };

  const addUSDAIngredientToRecipe = (item) => {
    const newIng = {
      fdcId: item.fdcId,
      name: item.description,
      amount: 100,
      unit: 'g'
    };
    setNewRecipeIngredients(prev => [...prev, newIng]);
  };

  const handleSaveCustomRecipe = () => {
    if (!newRecipeTitle.trim() || newRecipeIngredients.length === 0) return;

    const newRecipe = {
      id: `custom-${Date.now()}`,
      name: newRecipeTitle,
      budgetTier: 1,
      costPerServingUSD: 3.00,
      prepTimeMinutes: 15,
      macros: { calories: 450, protein: 35, carbs: 45, fat: 12 },
      dietaryFlags: { isHalal: true, isVegetarian: false, isDairyFree: true, isNutFree: true, isGlutenFree: true, isKosher: true },
      ingredients: newRecipeIngredients,
      instructions: "Combine custom ingredients and prepare."
    };

    const updatedRecipes = [newRecipe, ...customRecipes];
    setCustomRecipes(updatedRecipes);
    setNewRecipeTitle('');
    setNewRecipeIngredients([]);
    syncToCloud({ customRecipes: updatedRecipes });
  };

  // Consolidate Grocery Items across Weekly Plan
  const groceryList = useMemo(() => {
    return consolidateGroceryList(weeklyPlan);
  }, [weeklyPlan]);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <header className="flex flex-wrap justify-between items-center gap-4 border-b border-gray-700 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">OmniPath Nutrition</h1>
          <p className="text-xs opacity-75">Recipe Builder, Meal Planner & Multi-Store Grocery Sync</p>
        </div>
        <div className="flex items-center gap-4">
          <ThemeSwitcher currentTheme={theme} setTheme={(t) => { setTheme(t); syncToCloud({ theme: t }); }} />
          {user ? (
            <button onClick={() => signOut(auth)} className="text-xs border px-3 py-1 rounded">
              Log Out ({user.email})
            </button>
          ) : (
            <button onClick={() => setIsAuthOpen(true)} className="text-xs bg-[var(--accent)] text-white px-3 py-1 rounded">
              Log In / Sign Up
            </button>
          )}
        </div>
      </header>

      {/* Profile Goal & Budget Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[var(--card-bg)] p-4 rounded-lg border border-gray-700">
        <div>
          <label className="text-xs font-bold uppercase block mb-2">Goal Mode Target</label>
          <div className="flex gap-2">
            {['gain', 'lean', 'maintain'].map((mode) => (
              <button
                key={mode}
                onClick={() => { setGoalMode(mode); syncToCloud({ goalMode: mode }); }}
                className={`flex-1 py-1 text-xs font-semibold rounded ${
                  goalMode === mode ? 'bg-[var(--accent)] text-white' : 'border border-gray-600'
                }`}
              >
                {mode === 'gain' ? 'Mass Gain (+20%)' : mode === 'lean' ? 'Leaning Out (-20%)' : 'Maintenance'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-bold uppercase block mb-2">Max Budget Tier</label>
          <div className="flex gap-2">
            {[1, 2, 3].map((tier) => (
              <button
                key={tier}
                onClick={() => { setBudgetTier(tier); syncToCloud({ budgetTier: tier }); }}
                className={`flex-1 py-1 text-xs font-semibold rounded ${
                  budgetTier === tier ? 'bg-[var(--accent)] text-white' : 'border border-gray-600'
                }`}
              >
                Tier {tier} (${tier === 1 ? '<$2.50' : tier === 2 ? '<$5.00' : 'Premium'})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Feature Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 1. Recipe Search & Selection */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold">Recipe Collection ({filteredMeals.length})</h2>
          <input
            type="text"
            placeholder="Search recipes or ingredients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-2 text-xs rounded border bg-transparent"
          />

          <div className="max-h-[500px] overflow-y-auto space-y-3 pr-2">
            {filteredMeals.map((meal) => (
              <div key={meal.id} className="bg-[var(--card-bg)] p-3 rounded border border-gray-700 space-y-2">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-sm">{meal.name}</h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 border border-gray-600">
                    {meal.id.startsWith('custom') ? 'Custom' : 'Starter'}
                  </span>
                </div>
                <p className="text-xs opacity-75">
                  {meal.macros?.calories} kcal | P: {meal.macros?.protein}g | C: {meal.macros?.carbs}g | F: {meal.macros?.fat}g
                </p>

                {/* Slot Selector */}
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      const [day, slot] = e.target.value.split('-');
                      handleAddMealToSlot(meal, day, slot);
                      e.target.value = '';
                    }
                  }}
                  className="w-full text-xs p-1 rounded bg-transparent border border-gray-600"
                >
                  <option value="">+ Add to Day & Slot...</option>
                  {DAYS.map((day) =>
                    SLOTS.map((slot) => (
                      <option key={`${day}-${slot}`} value={`${day}-${slot}`}>
                        {day} — {slot}
                      </option>
                    ))
                  )}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Custom Recipe Builder (USDA Powered) */}
        <div className="bg-[var(--card-bg)] p-4 rounded border border-gray-700 space-y-4">
          <h2 className="text-lg font-bold">Custom Recipe Builder</h2>
          <input
            type="text"
            placeholder="Recipe Title (e.g., High-Protein Chicken Bowl)..."
            value={newRecipeTitle}
            onChange={(e) => setNewRecipeTitle(e.target.value)}
            className="w-full p-2 text-xs rounded border bg-transparent"
          />

          <form onSubmit={handleUSDASearch} className="flex gap-2">
            <input
              type="text"
              placeholder="Search USDA ingredient..."
              value={usdaQuery}
              onChange={(e) => setUsdaQuery(e.target.value)}
              className="flex-1 p-2 text-xs rounded border bg-transparent"
            />
            <button type="submit" className="px-3 py-1 text-xs bg-[var(--accent)] text-white font-bold rounded">
              Search
            </button>
          </form>

          {/* USDA Search Results */}
          <div className="max-h-[150px] overflow-y-auto space-y-1">
            {usdaResults.map((item) => (
              <div key={item.fdcId} className="p-1.5 border border-gray-700 rounded text-xs flex justify-between items-center">
                <span className="truncate pr-2">{item.description}</span>
                <button
                  type="button"
                  onClick={() => addUSDAIngredientToRecipe(item)}
                  className="px-2 py-0.5 text-[10px] bg-green-600 text-white rounded font-bold"
                >
                  + Add
                </button>
              </div>
            ))}
          </div>

          {/* Current Recipe Ingredients */}
          <div>
            <h4 className="text-xs font-bold uppercase mb-1">Selected Ingredients ({newRecipeIngredients.length})</h4>
            <div className="space-y-1 max-h-[100px] overflow-y-auto">
              {newRecipeIngredients.map((ing, idx) => (
                <div key={idx} className="text-xs p-1 bg-black/20 rounded flex justify-between">
                  <span>{ing.name}</span>
                  <span className="opacity-75">{ing.amount}{ing.unit}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleSaveCustomRecipe}
            disabled={!newRecipeTitle || newRecipeIngredients.length === 0}
            className="w-full py-2 text-xs font-bold bg-[var(--accent)] text-white rounded disabled:opacity-50"
          >
            Save Custom Recipe
          </button>
        </div>

        {/* 3. Multi-Store Shopping List Exporter */}
        <div className="bg-[var(--card-bg)] p-4 rounded border border-gray-700 space-y-4">
          <h2 className="text-lg font-bold">Shopping List ({groceryList.length} Items)</h2>

          {groceryList.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-2">
                <a
                  href={generateKrogerSearchLink(groceryList)}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full text-center py-1.5 text-xs bg-blue-600 text-white font-bold rounded"
                >
                  Shop at Kroger
                </a>
                <a
                  href={generateWalmartSearchLink(groceryList)}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full text-center py-1.5 text-xs bg-yellow-600 text-white font-bold rounded"
                >
                  Shop at Walmart
                </a>
                <a
                  href={generatePublixInstacartLink(groceryList)}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full text-center py-1.5 text-xs bg-green-600 text-white font-bold rounded"
                >
                  Shop at Publix
                </a>
                <button
                  onClick={() => exportMealPlanToWord('My OmniPath Weekly Schedule', weeklyPlan.map(w => w.mealData), groceryList)}
                  className="w-full py-1.5 text-xs border border-gray-500 font-bold rounded"
                >
                  Export to .DOCX
                </button>
              </div>

              <div className="max-h-[300px] overflow-y-auto space-y-1 border-t border-gray-700 pt-3">
                {groceryList.map((item, idx) => (
                  <div key={idx} className="p-2 border border-gray-700 rounded text-xs flex justify-between">
                    <span>{item.name}</span>
                    <span className="font-bold">{item.amount} {item.unit}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs opacity-75">Assign recipes to days in the weekly schedule to generate your list.</p>
          )}
        </div>

      </div>

      {/* 4. Weekly Day & Slot Meal Planner Grid */}
      <div className="bg-[var(--card-bg)] p-4 rounded border border-gray-700 space-y-4">
        <h2 className="text-lg font-bold">Weekly Meal Schedule</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {DAYS.map((day) => (
            <div key={day} className="border border-gray-700 p-2 rounded bg-black/10 space-y-2">
              <h3 className="font-bold text-xs text-center border-b border-gray-700 pb-1">{day}</h3>
              {SLOTS.map((slot) => {
                const items = weeklyPlan.filter(p => p.day === day && p.slot === slot);
                return (
                  <div key={slot} className="space-y-1">
                    <span className="text-[10px] font-semibold opacity-60 uppercase">{slot}</span>
                    {items.map(entry => (
                      <div key={entry.id} className="p-1.5 bg-[var(--card-bg)] border border-gray-600 rounded text-[11px] flex justify-between items-start">
                        <span className="font-medium truncate pr-1">{entry.mealData?.name}</span>
                        <button
                          onClick={() => handleRemoveFromSlot(entry.id)}
                          className="text-red-400 font-bold text-xs leading-none"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} user={user} />
    </div>
  );
}
