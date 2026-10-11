import React, { useState, useEffect, useMemo } from 'react';
import mealsData from './data/meals_400.json';
import dietaryFlagsList from './data/dietary_flags.json';
import { searchUSDAFood, getUSDAFoodDetails } from './services/usdaService';
import { exportMealPlanToWord } from './services/exportService';
import { consolidateGroceryList } from './services/groceryAggregator';
import { 
  generatePublixInstacartLink, 
  generateWalmartListLink, 
  generateKrogerCartLink 
} from './services/retailService';
import { saveUserData, getUserData } from './services/dbService';
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
  
  // Recipe Collection Filter Scope: 'all' | 'starter' | 'my_recipes' | 'public'
  const [collectionScope, setCollectionScope] = useState('all');

  // Recipe & Meal Plan State
  const [customRecipes, setCustomRecipes] = useState([]);
  const [weeklyPlan, setWeeklyPlan] = useState([]); // [{ id, day, slot, mealId, mealData }]
  const [searchTerm, setSearchTerm] = useState('');

  // Modals State
  const [viewRecipeModal, setViewRecipeModal] = useState(null); // Recipe details view
  const [inspectUsdaItem, setInspectUsdaItem] = useState(null); // USDA inspection item
  const [isInspectingUsda, setIsInspectingUsda] = useState(false);

  // USDA Builder State
  const [usdaQuery, setUsdaQuery] = useState('');
  const [usdaResults, setUsdaResults] = useState([]);
  const [newRecipeTitle, setNewRecipeTitle] = useState('');
  const [newRecipeIngredients, setNewRecipeIngredients] = useState([]);
  const [isNewRecipePublic, setIsNewRecipePublic] = useState(false);

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

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    syncToCloud({ theme: newTheme });
  };

  // Combine & Filter Recipes based on Scope & Search
  const filteredMeals = useMemo(() => {
    let baseList = [];

    if (collectionScope === 'starter') {
      baseList = mealsData;
    } else if (collectionScope === 'my_recipes') {
      baseList = customRecipes.filter(r => !user || r.userId === user.uid || !r.isPublic);
    } else if (collectionScope === 'public') {
      baseList = customRecipes.filter(r => r.isPublic);
    } else {
      // 'all' scope
      baseList = [...customRecipes, ...mealsData];
    }

    return baseList.filter(meal => {
      if (meal.budgetTier && meal.budgetTier > budgetTier) return false;
      for (let flag of activeFlags) {
        if (meal.dietaryFlags && !meal.dietaryFlags[flag]) return false;
      }
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const titleMatch = meal.name.toLowerCase().includes(query);
        const ingredientMatch = meal.ingredients?.some(i => (i.name || i.food || i.text || '').toLowerCase().includes(query));
        if (!titleMatch && !ingredientMatch) return false;
      }
      return true;
    });
  }, [customRecipes, collectionScope, budgetTier, activeFlags, searchTerm, user]);

  // Calendar Management
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

  const handleRemoveFromSlot = (entryId, e) => {
    e.stopPropagation();
    const updatedPlan = weeklyPlan.filter(item => item.id !== entryId);
    setWeeklyPlan(updatedPlan);
    syncToCloud({ weeklyPlan: updatedPlan });
  };

  // USDA Search & Inspection
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

  const handleInspectUsdaFood = async (item) => {
    setIsInspectingUsda(true);
    setInspectUsdaItem(item);
    try {
      if (item.fdcId) {
        const detailedData = await getUSDAFoodDetails(item.fdcId);
        if (detailedData) {
          setInspectUsdaItem(detailedData);
        }
      }
    } catch (err) {
      console.error('Failed to fetch detailed USDA info:', err);
    } finally {
      setIsInspectingUsda(false);
    }
  };

  const addUSDAIngredientToRecipe = (item) => {
    const name = item.description || item.foodDescription || item.name || 'USDA Ingredient';
    const newIng = {
      fdcId: item.fdcId,
      name: name,
      amount: 100,
      unit: 'g'
    };
    setNewRecipeIngredients(prev => [...prev, newIng]);
  };

  const handleSaveCustomRecipe = () => {
    if (!newRecipeTitle.trim() || newRecipeIngredients.length === 0) return;

    const newRecipe = {
      id: `custom-${Date.now()}`,
      userId: user?.uid || 'guest',
      name: newRecipeTitle,
      budgetTier: 1,
      costPerServingUSD: 3.00,
      prepTimeMinutes: 15,
      isPublic: isNewRecipePublic,
      macros: { calories: 450, protein: 35, carbs: 45, fat: 12 },
      dietaryFlags: { isHalal: true, isVegetarian: false, isDairyFree: true, isNutFree: true, isGlutenFree: true, isKosher: true },
      ingredients: newRecipeIngredients,
      instructions: "Combine ingredients, portion appropriately, and cook to desired preference."
    };

    const updatedRecipes = [newRecipe, ...customRecipes];
    setCustomRecipes(updatedRecipes);
    setNewRecipeTitle('');
    setNewRecipeIngredients([]);
    setIsNewRecipePublic(false);
    syncToCloud({ customRecipes: updatedRecipes });
  };

  // Consolidated Grocery List
  const groceryList = useMemo(() => {
    return consolidateGroceryList(weeklyPlan);
  }, [weeklyPlan]);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header & Theme Selection */}
      <header className="flex flex-wrap justify-between items-center gap-4 border-b border-gray-700 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">OmniPath Nutrition</h1>
          <p className="text-xs opacity-75">Recipe Builder, Weekly Planner & Multi-Store Grocery Sync</p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Theme Dropdown */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold uppercase hidden sm:inline">Theme:</label>
            <select
              value={theme}
              onChange={(e) => handleThemeChange(e.target.value)}
              className="p-1.5 text-xs rounded border border-gray-600 bg-black/20 font-semibold cursor-pointer"
            >
              <option value="standard">Standard Theme</option>
              <option value="pretty">Pretty Theme ✨</option>
              <option value="manly">Manly Theme ⚡</option>
              <option value="beach">Beach Vibe 🏖️</option>
              <option value="circus">Circus Theme 🎪</option>
            </select>
          </div>

          {user ? (
            <button onClick={() => signOut(auth)} className="text-xs border px-3 py-1.5 rounded">
              Log Out ({user.email})
            </button>
          ) : (
            <button onClick={() => setIsAuthOpen(true)} className="text-xs bg-[var(--accent)] text-white px-3 py-1.5 rounded font-bold">
              Log In / Sign Up
            </button>
          )}
        </div>
      </header>

      {/* Goal & Budget Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[var(--card-bg)] p-4 rounded-lg border border-gray-700">
        <div>
          <label className="text-xs font-bold uppercase block mb-2">Profile Goal Target</label>
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
        
        {/* 1. Recipe Collection with Dropdown Filter Scope */}
        <div className="space-y-4 bg-[var(--card-bg)] p-4 rounded border border-gray-700">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h2 className="text-lg font-bold">Recipes ({filteredMeals.length})</h2>
            
            {/* Scope Filter Dropdown */}
            <select
              value={collectionScope}
              onChange={(e) => setCollectionScope(e.target.value)}
              className="text-xs p-1.5 rounded border border-gray-600 bg-transparent font-semibold"
            >
              <option value="all">All Recipes</option>
              <option value="starter">Pre-created Starter Recipes</option>
              <option value="my_recipes">My Account Recipes</option>
              <option value="public">Public Community Recipes</option>
            </select>
          </div>

          <input
            type="text"
            placeholder="Search recipes or ingredients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-2 text-xs rounded border bg-transparent"
          />

          <div className="max-h-[480px] overflow-y-auto space-y-3 pr-2">
            {filteredMeals.map((meal) => (
              <div 
                key={meal.id} 
                onClick={() => setViewRecipeModal(meal)}
                className="bg-black/10 hover:bg-black/20 cursor-pointer p-3 rounded border border-gray-700 space-y-2 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-sm underline-offset-2 hover:underline">{meal.name}</h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 border border-gray-600">
                    {meal.id.startsWith('custom') ? (meal.isPublic ? 'Public' : 'Custom') : 'Starter'}
                  </span>
                </div>
                <p className="text-xs opacity-75">
                  {meal.macros?.calories} kcal | P: {meal.macros?.protein}g | C: {meal.macros?.carbs}g | F: {meal.macros?.fat}g
                </p>

                {/* Slot Selector */}
                <select
                  onClick={(e) => e.stopPropagation()}
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

        {/* 2. Custom Recipe Builder (with Public Toggle & USDA) */}
        <div className="bg-[var(--card-bg)] p-4 rounded border border-gray-700 space-y-4">
          <h2 className="text-lg font-bold">Custom Recipe Builder</h2>
          <input
            type="text"
            placeholder="Recipe Title (e.g., High-Protein Chicken Bowl)..."
            value={newRecipeTitle}
            onChange={(e) => setNewRecipeTitle(e.target.value)}
            className="w-full p-2 text-xs rounded border bg-transparent"
          />

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="makePublicToggle"
              checked={isNewRecipePublic}
              onChange={(e) => setIsNewRecipePublic(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="makePublicToggle" className="text-xs font-semibold cursor-pointer">
              Make Public for all accounts to see
            </label>
          </div>

          <form onSubmit={handleUSDASearch} className="flex gap-2">
            <input
              type="text"
              placeholder="Search USDA ingredients..."
              value={usdaQuery}
              onChange={(e) => setUsdaQuery(e.target.value)}
              className="flex-1 p-2 text-xs rounded border bg-transparent"
            />
            <button type="submit" className="px-3 py-1 text-xs bg-[var(--accent)] text-white font-bold rounded">
              Search
            </button>
          </form>

          {/* USDA Search Results with Inspect Button */}
          <div className="max-h-[160px] overflow-y-auto space-y-1.5">
            {usdaResults.map((item) => (
              <div key={item.fdcId} className="p-1.5 border border-gray-700 rounded text-xs flex justify-between items-center">
                <span className="truncate pr-2">{item.description}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleInspectUsdaFood(item)}
                    className="px-2 py-0.5 text-[10px] bg-blue-600 text-white rounded font-bold"
                  >
                    Inspect
                  </button>
                  <button
                    type="button"
                    onClick={() => addUSDAIngredientToRecipe(item)}
                    className="px-2 py-0.5 text-[10px] bg-green-600 text-white rounded font-bold"
                  >
                    + Add
                  </button>
                </div>
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

        {/* 3. Multi-Store Direct List Exporter */}
        <div className="bg-[var(--card-bg)] p-4 rounded border border-gray-700 space-y-4">
          <h2 className="text-lg font-bold">Shopping List ({groceryList.length} Items)</h2>

          {groceryList.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-2">
                <a
                  href={generateKrogerCartLink(groceryList)}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full text-center py-1.5 text-xs bg-blue-600 text-white font-bold rounded"
                >
                  Shop at Kroger (Add to App)
                </a>
                <a
                  href={generateWalmartListLink(groceryList)}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full text-center py-1.5 text-xs bg-yellow-600 text-white font-bold rounded"
                >
                  Shop at Walmart (Add to App)
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

              <div className="max-h-[280px] overflow-y-auto space-y-1 border-t border-gray-700 pt-3">
                {groceryList.map((item, idx) => (
                  <div key={idx} className="p-2 border border-gray-700 rounded text-xs flex justify-between">
                    <span>{item.name}</span>
                    <span className="font-bold">{item.amount} {item.unit}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs opacity-75">Assign recipes to days in the weekly schedule below to populate your list.</p>
          )}
        </div>

      </div>

      {/* 4. Weekly Day & Slot Meal Schedule */}
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
                      <div 
                        key={entry.id} 
                        onClick={() => setViewRecipeModal(entry.mealData)}
                        className="p-1.5 bg-[var(--card-bg)] border border-gray-600 hover:border-[var(--accent)] cursor-pointer rounded text-[11px] flex justify-between items-start"
                      >
                        <span className="font-medium truncate pr-1">{entry.mealData?.name}</span>
                        <button
                          onClick={(e) => handleRemoveFromSlot(entry.id, e)}
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

      {/* Modal 1: Recipe Details View (Opened on Click) */}
      {viewRecipeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--card-bg)] p-6 rounded-lg max-w-lg w-full border border-gray-700 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-gray-700 pb-2">
              <h3 className="text-xl font-bold">{viewRecipeModal.name}</h3>
              <button onClick={() => setViewRecipeModal(null)} className="font-bold text-lg">×</button>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center text-xs bg-black/20 p-2 rounded border border-gray-700">
              <div><span className="block font-bold">Calories</span>{viewRecipeModal.macros?.calories || 0} kcal</div>
              <div><span className="block font-bold">Protein</span>{viewRecipeModal.macros?.protein || 0}g</div>
              <div><span className="block font-bold">Carbs</span>{viewRecipeModal.macros?.carbs || 0}g</div>
              <div><span className="block font-bold">Fat</span>{viewRecipeModal.macros?.fat || 0}g</div>
            </div>

            <div>
              <h4 className="font-bold text-xs uppercase mb-1">Ingredients:</h4>
              <ul className="list-disc list-inside text-xs space-y-1">
                {viewRecipeModal.ingredients?.map((ing, i) => (
                  <li key={i}>{ing.name || ing.food || ing.text} — {ing.amount || ing.weight || 1}{ing.unit || ing.measure || 'g'}</li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-xs uppercase mb-1">Instructions:</h4>
              <p className="text-xs opacity-90 leading-relaxed whitespace-pre-line">{viewRecipeModal.instructions || "Combine ingredients and prepare as desired."}</p>
            </div>

            <button onClick={() => setViewRecipeModal(null)} className="w-full py-2 bg-[var(--accent)] text-white text-xs font-bold rounded">
              Close Recipe
            </button>
          </div>
        </div>
      )}

      {/* Modal 2: USDA Ingredient Inspector Modal */}
      {inspectUsdaItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--card-bg)] p-6 rounded-lg max-w-md w-full border border-gray-700 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-gray-700 pb-2">
              <div>
                <h3 className="text-lg font-bold">{inspectUsdaItem.description || inspectUsdaItem.name}</h3>
                <p className="text-xs opacity-75">FDC ID: {inspectUsdaItem.fdcId} | Brand: {inspectUsdaItem.brandOwner || 'Generic / USDA'}</p>
              </div>
              <button onClick={() => setInspectUsdaItem(null)} className="font-bold text-lg">×</button>
            </div>

            {isInspectingUsda ? (
              <p className="text-xs text-center py-4">Fetching full nutrient breakdown...</p>
            ) : (
              <div className="space-y-3">
                <h4 className="font-bold text-xs uppercase">Nutrient Breakdown (per 100g):</h4>
                <div className="max-h-[220px] overflow-y-auto space-y-1 border border-gray-700 p-2 rounded text-xs bg-black/10">
                  {inspectUsdaItem.foodNutrients?.map((n, i) => (
                    <div key={i} className="flex justify-between py-0.5 border-b border-gray-800">
                      <span>{n.nutrientName || n.nutrient?.name || 'Nutrient'}</span>
                      <span className="font-bold">{n.value || n.amount} {n.unitName || n.nutrient?.unitName || 'g'}</span>
                    </div>
                  )) || <p className="text-xs opacity-75">Standard USDA baseline nutrient profile.</p>}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      addUSDAIngredientToRecipe(inspectUsdaItem);
                      setInspectUsdaItem(null);
                    }}
                    className="flex-1 py-2 bg-green-600 text-white text-xs font-bold rounded"
                  >
                    + Add to Recipe
                  </button>
                  <button onClick={() => setInspectUsdaItem(null)} className="py-2 px-4 border text-xs font-bold rounded">
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} user={user} />
    </div>
  );
}
