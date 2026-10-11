import React, { useState, useEffect } from 'react';
import mealsData from './data/meals_400.json';
import dietaryFlagsList from './data/dietary_flags.json';
import { searchUSDAFood } from './services/usdaService';
import { exportMealPlanToWord } from './services/exportService';
import { consolidateGroceryList } from './services/groceryAggregator';
import { generatePublixInstacartLink } from './services/retailService';
import { saveUserData, getUserData } from './services/dbService';
import ThemeSwitcher from './components/ui/ThemeSwitcher';
import AuthModal from './components/auth/AuthModal';
import { auth } from './config/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';

export default function App() {
  const [theme, setTheme] = useState('standard');
  const [user, setUser] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [goalMode, setGoalMode] = useState('maintain');
  const [budgetTier, setBudgetTier] = useState(1);
  const [activeFlags, setActiveFlags] = useState([]);
  const [selectedMealIds, setSelectedMealIds] = useState([]);
  const [usdaQuery, setUsdaQuery] = useState('');
  const [usdaResults, setUsdaResults] = useState([]);

  // Load user data from Firebase Firestore upon authentication
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
          if (cloudData.selectedMealIds) setSelectedMealIds(cloudData.selectedMealIds);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync state changes directly to Firebase Firestore
  const syncToCloud = (updatedState = {}) => {
    if (!user) return;
    const currentState = {
      theme,
      goalMode,
      budgetTier,
      activeFlags,
      selectedMealIds,
      ...updatedState
    };
    saveUserData(user.uid, currentState);
  };

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    syncToCloud({ theme: newTheme });
  };

  const handleGoalChange = (mode) => {
    setGoalMode(mode);
    syncToCloud({ goalMode: mode });
  };

  const handleBudgetChange = (tier) => {
    setBudgetTier(tier);
    syncToCloud({ budgetTier: tier });
  };

  const toggleFlag = (flagId) => {
    const updatedFlags = activeFlags.includes(flagId)
      ? activeFlags.filter(f => f !== flagId)
      : [...activeFlags, flagId];
    setActiveFlags(updatedFlags);
    syncToCloud({ activeFlags: updatedFlags });
  };

  const toggleMealSelection = (mealId) => {
    const updatedMeals = selectedMealIds.includes(mealId)
      ? selectedMealIds.filter(id => id !== mealId)
      : [...selectedMealIds, mealId];
    setSelectedMealIds(updatedMeals);
    syncToCloud({ selectedMealIds: updatedMeals });
  };

  const filteredMeals = mealsData.filter(meal => {
    if (meal.budgetTier > budgetTier) return false;
    for (let flag of activeFlags) {
      if (!meal.dietaryFlags[flag]) return false;
    }
    return true;
  });

  const selectedMeals = mealsData.filter(m => selectedMealIds.includes(m.id));
  const groceryList = consolidateGroceryList(selectedMeals);

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

  const handleExportWord = () => {
    exportMealPlanToWord('My OmniPath Meal Plan', selectedMeals, groceryList);
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <header className="flex flex-wrap justify-between items-center gap-4 border-b border-gray-700 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">OmniPath Nutrition</h1>
          <p className="text-xs opacity-75">Automated Cloud Meal & Grocery Intelligence</p>
        </div>
        <div className="flex items-center gap-4">
          <ThemeSwitcher currentTheme={theme} setTheme={handleThemeChange} />
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

      {/* Controls Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[var(--card-bg)] p-4 rounded-lg border border-gray-700">
        <div>
          <label className="text-xs font-bold uppercase block mb-2">Profile Goal Mode</label>
          <div className="flex gap-2">
            {['gain', 'lean', 'maintain'].map((mode) => (
              <button
                key={mode}
                onClick={() => handleGoalChange(mode)}
                className={`flex-1 py-1 text-xs capitalize font-semibold rounded ${
                  goalMode === mode ? 'bg-[var(--accent)] text-white' : 'border border-gray-600'
                }`}
              >
                {mode === 'gain' ? 'Gaining Mass' : mode === 'lean' ? 'Leaning Out' : 'Maintaining'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-bold uppercase block mb-2">Budget Preference</label>
          <div className="flex gap-2">
            {[1, 2, 3].map((tier) => (
              <button
                key={tier}
                onClick={() => handleBudgetChange(tier)}
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

      {/* Dietary Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-bold uppercase mr-2">Filters:</span>
        {dietaryFlagsList.map((flag) => (
          <button
            key={flag.id}
            onClick={() => toggleFlag(flag.id)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              activeFlags.includes(flag.id) ? 'bg-[var(--accent)] text-white border-transparent' : 'border-gray-600 opacity-70'
            }`}
          >
            {flag.label}
          </button>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-bold">Starter Meals ({filteredMeals.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-2">
            {filteredMeals.map((meal) => {
              const isSelected = selectedMealIds.includes(meal.id);
              return (
                <div key={meal.id} className="bg-[var(--card-bg)] p-4 rounded border border-gray-700 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-sm">{meal.name}</h3>
                    <p className="text-xs opacity-75 mt-1">
                      {meal.macros.calories} kcal | P: {meal.macros.protein}g | C: {meal.macros.carbs}g | F: {meal.macros.fat}g
                    </p>
                  </div>
                  <button
                    onClick={() => toggleMealSelection(meal.id)}
                    className={`mt-3 py-1 px-2 text-xs font-bold rounded ${
                      isSelected ? 'bg-green-600 text-white' : 'border border-gray-500'
                    }`}
                  >
                    {isSelected ? 'Added to Plan' : '+ Add Meal'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* USDA Search */}
        <div className="bg-[var(--card-bg)] p-4 rounded border border-gray-700 space-y-4">
          <h2 className="text-lg font-bold">USDA Food Lookup</h2>
          <form onSubmit={handleUSDASearch} className="flex gap-2">
            <input
              type="text"
              placeholder="Search USDA database..."
              value={usdaQuery}
              onChange={(e) => setUsdaQuery(e.target.value)}
              className="flex-1 p-2 text-xs rounded border bg-transparent"
            />
            <button type="submit" className="px-3 py-1 text-xs bg-[var(--accent)] text-white font-bold rounded">
              Search
            </button>
          </form>

          <div className="max-h-[350px] overflow-y-auto space-y-2">
            {usdaResults.map((item) => (
              <div key={item.fdcId} className="p-2 border border-gray-700 rounded text-xs">
                <p className="font-bold">{item.description}</p>
                <p className="opacity-75">FDC ID: {item.fdcId} | Brand: {item.brandOwner || 'Generic'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Grocery List & Export */}
      {selectedMeals.length > 0 && (
        <div className="bg-[var(--card-bg)] p-4 rounded border border-gray-700 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold">Autogenerated Grocery List ({groceryList.length} Items)</h2>
            <div className="flex gap-2">
              <a
                href={generatePublixInstacartLink(groceryList)}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1 text-xs border border-green-600 text-green-500 rounded font-bold"
              >
                Shop at Publix
              </a>
              <button onClick={handleExportWord} className="px-3 py-1 text-xs bg-[var(--accent)] text-white rounded font-bold">
                Export to .DOCX
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {groceryList.map((item, idx) => (
              <div key={idx} className="p-2 border border-gray-700 rounded text-xs">
                <p className="font-semibold">{item.name}</p>
                <p className="opacity-75">{item.amount} {item.unit}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} user={user} />
    </div>
  );
}
