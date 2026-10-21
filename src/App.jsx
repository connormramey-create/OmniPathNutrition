import React, { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react';
import mealsData from './data/recipes_500.json'; // previous dataset kept at ./data/meals_400.json
import dietaryFlagsList from './data/dietary_flags.json';
import { searchUSDAFood, getUSDAFoodDetails, IS_DEMO_KEY } from './services/usdaService';
import { exportMealPlanToWord } from './services/exportService';
import { consolidateGroceryList } from './services/groceryAggregator';
import { STORES, STORE_IDS, buildShoppingItems, listAsText } from './services/retailService';
import { planTotals } from './services/mealPlanGenerator';
import {
  saveUserData,
  getUserData,
  publishPublicRecipe,
  unpublishPublicRecipe,
  subscribeToPublicRecipes,
  publicAuthorName
} from './services/dbService';
import { prepareMeal, estimateRecipeCost } from './utils/mealPrep';
import { DEFAULT_PROFILE, calculateTargets, validateProfile } from './utils/nutrition';
import {
  getPortionOptions,
  getDefaultPortion,
  getMacrosPer100g,
  buildUsdaIngredient,
  updateIngredientPortion,
  scaleMacros,
  sumMacros
} from './utils/usdaPortions';
import { buildIngredientOptions, containsExcludedIngredient } from './utils/ingredientFilter';
import AuthModal from './components/auth/AuthModal';
import MealPlanGenerator from './components/planner/MealPlanGenerator';
import CartBuilderModal from './components/shopping/CartBuilderModal';
import IngredientExcludeFilter from './components/filters/IngredientExcludeFilter';
import { auth } from './config/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const PAGE_SIZE = 40;
const LOCAL_SETTINGS_KEY = 'omnipath.settings';
const MAX_NOTE_LENGTH = 2000;

// Older versions stored a 3-button budget tier; convert it to a dollar limit ('' = any).
const TIER_TO_MAX_COST = { 1: '2.50', 2: '5.00', 3: '' };
const initialMaxCost = (saved) => {
  if (saved.maxCostPerServing !== undefined && saved.maxCostPerServing !== null) return String(saved.maxCostPerServing);
  return TIER_TO_MAX_COST[saved.budgetTier] ?? '';
};
const maxCostLimit = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
};

// Notes are stored in Firestore as an array: setDoc(..., { merge: true }) deep-merges maps,
// so a deleted key in a map would never be removed from the cloud copy.
const notesToArray = (notes = {}) =>
  Object.entries(notes).map(([recipeId, n]) => ({ recipeId, text: n.text, updatedAt: n.updatedAt }));
const notesFromArray = (arr) => {
  const out = {};
  (Array.isArray(arr) ? arr : []).forEach(n => {
    if (n?.recipeId && typeof n.text === 'string' && n.text.trim()) out[n.recipeId] = { text: n.text, updatedAt: n.updatedAt };
  });
  return out;
};

// Prepare the 500 starter recipes once (adds planner fields: per-serving macros, cost, slots)
const STARTER_MEALS = mealsData.map(prepareMeal);

function loadLocalSettings() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}

const normalizePlan = (plan = []) =>
  plan.map(e => {
    const mealData = e.mealData ? prepareMeal(e.mealData) : e.mealData;
    return { ...e, mealData, servings: e.servings ?? mealData?.servings ?? 1 };
  });

const fmtServ = s => (Number.isInteger(s) ? `${s}` : s.toFixed(2).replace(/0$/, ''));

export default function App() {
  const local = useMemo(loadLocalSettings, []);

  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'standard');
  const [user, setUser] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [maxCostPerServing, setMaxCostPerServing] = useState(() => initialMaxCost(local)); // string, '' = any
  const [activeFlags, setActiveFlags] = useState(local.activeFlags ?? []);
  const [excludedIngredients, setExcludedIngredients] = useState(local.excludedIngredients ?? []);
  // Personal notes on any recipe, tied to the signed-in account: { [recipeId]: { text, updatedAt } }
  const [recipeNotes, setRecipeNotes] = useState({});
  const [noteDraft, setNoteDraft] = useState('');
  const [noteStatus, setNoteStatus] = useState('');
  const [notesLoadCount, setNotesLoadCount] = useState(0); // bumps when notes arrive from the cloud
  const [preferredStore, setPreferredStore] = useState(local.preferredStore ?? 'kroger');
  const [hidePantry, setHidePantry] = useState(local.hidePantry ?? true);
  const [profile, setProfile] = useState({ ...DEFAULT_PROFILE, ...(local.profile || {}) });

  // Recipe Collection Filter Scope: 'all' | 'starter' | 'my_recipes' | 'public'
  const [collectionScope, setCollectionScope] = useState('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Recipe & Meal Plan State
  const [customRecipes, setCustomRecipes] = useState([]);
  const [weeklyPlan, setWeeklyPlan] = useState([]); // [{ id, day, slot, mealId, servings, mealData }]
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearch = useDeferredValue(searchTerm);

  // Modals State
  const [viewRecipeModal, setViewRecipeModal] = useState(null);
  const [inspectUsdaItem, setInspectUsdaItem] = useState(null);
  const [inspectPortion, setInspectPortion] = useState({ portionId: '100g', qty: 1 });
  const [isInspectingUsda, setIsInspectingUsda] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartAddedKeys, setCartAddedKeys] = useState([]);
  const [copied, setCopied] = useState(false);

  // USDA Builder State
  const [usdaQuery, setUsdaQuery] = useState('');
  const [usdaResults, setUsdaResults] = useState([]);
  const [usdaLoading, setUsdaLoading] = useState(false);
  const [usdaError, setUsdaError] = useState('');
  const [usdaSearched, setUsdaSearched] = useState(false);
  const [resultPortions, setResultPortions] = useState({}); // { [fdcId]: { portionId, qty } }
  const searchAbortRef = useRef(null);

  const [newRecipeTitle, setNewRecipeTitle] = useState('');
  const [newRecipeIngredients, setNewRecipeIngredients] = useState([]);
  const [newRecipeServings, setNewRecipeServings] = useState(1);
  const [newRecipeCost, setNewRecipeCost] = useState('');
  const [newRecipeSteps, setNewRecipeSteps] = useState(['']);
  const [isNewRecipePublic, setIsNewRecipePublic] = useState(false);

  // Public community recipes shared by every account (Firestore /publicRecipes)
  const [publicRecipes, setPublicRecipes] = useState([]);
  const [publicError, setPublicError] = useState('');
  const [recipeActionMsg, setRecipeActionMsg] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // Authenticated State Sync
  useEffect(() => {
    if (!auth) return undefined; // guest mode – Firebase not configured
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setRecipeNotes({}); // notes belong to the account – hide them after logout
      if (currentUser) {
        try {
          const cloudData = await getUserData(currentUser.uid);
          if (cloudData) {
            if (cloudData.theme) {
              setTheme(cloudData.theme);
              document.documentElement.setAttribute('data-theme', cloudData.theme);
              try { localStorage.setItem('omnipath.theme', cloudData.theme); } catch { /* ignore */ }
            }
            if (cloudData.maxCostPerServing !== undefined || cloudData.budgetTier) setMaxCostPerServing(initialMaxCost(cloudData));
            if (cloudData.activeFlags) setActiveFlags(cloudData.activeFlags);
            if (Array.isArray(cloudData.excludedIngredients)) setExcludedIngredients(cloudData.excludedIngredients);
            setRecipeNotes(notesFromArray(cloudData.recipeNotes));
            setNotesLoadCount(c => c + 1);
            if (cloudData.customRecipes) {
              setCustomRecipes(cloudData.customRecipes);
              // Recipes marked public before the shared collection existed only lived in
              // this user's private document – publish them so other accounts can see them.
              cloudData.customRecipes
                .filter(r => r.isPublic && (r.userId === currentUser.uid || r.userId === 'guest'))
                .forEach(r => publishPublicRecipe(r, currentUser).catch(err => console.error('Publish backfill failed:', err)));
            }
            if (cloudData.weeklyPlan) setWeeklyPlan(normalizePlan(cloudData.weeklyPlan));
            if (cloudData.preferredStore && STORES[cloudData.preferredStore]) setPreferredStore(cloudData.preferredStore);
            if (typeof cloudData.hidePantry === 'boolean') setHidePantry(cloudData.hidePantry);
            if (cloudData.profile) setProfile(p => ({ ...p, ...cloudData.profile }));
          }
        } catch (err) {
          console.error('Failed to load cloud data:', err);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Live public-recipe feed for signed-in users
  useEffect(() => {
    if (!user) {
      setPublicRecipes([]);
      return undefined;
    }
    setPublicError('');
    return subscribeToPublicRecipes(
      recipes => setPublicRecipes(recipes),
      err => {
        console.error('Public recipe feed failed:', err);
        setPublicError('Could not load community recipes. Check that firestore.rules has been deployed.');
      }
    );
  }, [user]);

  // Remember settings on this device (works for guests too)
  useEffect(() => {
    try {
      localStorage.setItem(
        LOCAL_SETTINGS_KEY,
        JSON.stringify({ maxCostPerServing, activeFlags, excludedIngredients, preferredStore, hidePantry, profile })
      );
    } catch {
      // storage unavailable – ignore
    }
  }, [maxCostPerServing, activeFlags, excludedIngredients, preferredStore, hidePantry, profile]);

  // Always sync the latest state – debounced saves run from an older render and would
  // otherwise overwrite newer changes (e.g. a note saved while a profile edit is pending).
  const latestStateRef = useRef({});
  latestStateRef.current = {
    theme,
    maxCostPerServing,
    activeFlags,
    excludedIngredients,
    customRecipes,
    weeklyPlan,
    preferredStore,
    hidePantry,
    profile,
    recipeNotes
  };

  const syncToCloud = (updatedState = {}) => {
    if (!user) return;
    const next = { ...latestStateRef.current, ...updatedState };
    saveUserData(user.uid, {
      ...next,
      recipeNotes: notesToArray(next.recipeNotes)
    }).catch(err => console.error('Cloud sync failed:', err));
  };

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    try { localStorage.setItem('omnipath.theme', newTheme); } catch { /* storage unavailable */ }
    syncToCloud({ theme: newTheme });
  };

  const handleStoreChange = (storeId) => {
    setPreferredStore(storeId);
    setCartAddedKeys([]);
    syncToCloud({ preferredStore: storeId });
  };

  const toggleFlag = (flagId) => {
    const updated = activeFlags.includes(flagId)
      ? activeFlags.filter(f => f !== flagId)
      : [...activeFlags, flagId];
    setActiveFlags(updated);
    syncToCloud({ activeFlags: updated });
  };

  // Debounced cloud save for profile edits (avoids a Firestore write per keystroke)
  const profileSaveTimer = useRef(null);
  const handleProfileChange = (next) => {
    setProfile(next);
    clearTimeout(profileSaveTimer.current);
    profileSaveTimer.current = setTimeout(() => syncToCloud({ profile: next }), 800);
  };

  const handleExcludedChange = (next) => {
    setExcludedIngredients(next);
    syncToCloud({ excludedIngredients: next });
  };

  // Debounced like the profile so typing "4.50" doesn't write to Firestore per keystroke
  const costSaveTimer = useRef(null);
  const handleMaxCostChange = (value) => {
    setMaxCostPerServing(value);
    clearTimeout(costSaveTimer.current);
    costSaveTimer.current = setTimeout(() => syncToCloud({ maxCostPerServing: value }), 800);
  };

  // ---------- Personal recipe notes (saved to the signed-in account) ----------
  const viewedRecipeId = viewRecipeModal?.id;
  useEffect(() => {
    setNoteDraft(viewedRecipeId ? recipeNotes[viewedRecipeId]?.text || '' : '');
    setNoteStatus('');
    // Only reset the draft when a different recipe is opened or notes finish loading
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedRecipeId, notesLoadCount]);

  const saveRecipeNote = (recipeId, text) => {
    if (!user || !recipeId) return;
    const trimmed = text.trim().slice(0, MAX_NOTE_LENGTH);
    const updated = { ...recipeNotes };
    if (trimmed) updated[recipeId] = { text: trimmed, updatedAt: new Date().toISOString() };
    else delete updated[recipeId];
    setRecipeNotes(updated);
    setNoteDraft(trimmed);
    syncToCloud({ recipeNotes: updated });
    setNoteStatus(trimmed ? 'Note saved to your account.' : 'Note removed.');
    setTimeout(() => setNoteStatus(''), 3000);
  };

  const preparedCustom = useMemo(() => customRecipes.map(prepareMeal), [customRecipes]);

  // Other people's public recipes (your own already appear via customRecipes)
  const preparedCommunity = useMemo(
    () => publicRecipes.filter(r => r.userId !== user?.uid).map(prepareMeal),
    [publicRecipes, user]
  );

  // Every ingredient name across all recipes, for the "Exclude ingredients" picker
  const ingredientOptions = useMemo(
    () => buildIngredientOptions([...STARTER_MEALS, ...preparedCustom, ...preparedCommunity]),
    [preparedCustom, preparedCommunity]
  );

  // Recipes that pass the dietary and ingredient filters (used by the generator)
  const dietaryEligibleMeals = useMemo(() => {
    return [...preparedCustom, ...preparedCommunity, ...STARTER_MEALS].filter(meal =>
      activeFlags.every(flag => !meal.dietaryFlags || meal.dietaryFlags[flag]) &&
      !containsExcludedIngredient(meal, excludedIngredients)
    );
  }, [preparedCustom, preparedCommunity, activeFlags, excludedIngredients]);

  // Combine & Filter Recipes based on Scope & Search
  const filteredMeals = useMemo(() => {
    let baseList;
    if (collectionScope === 'starter') {
      baseList = STARTER_MEALS;
    } else if (collectionScope === 'my_recipes') {
      baseList = preparedCustom;
    } else if (collectionScope === 'public') {
      baseList = [...preparedCustom.filter(r => r.isPublic), ...preparedCommunity];
    } else {
      baseList = [...preparedCustom, ...preparedCommunity, ...STARTER_MEALS];
    }

    const maxCost = maxCostLimit(maxCostPerServing);
    const query = deferredSearch.trim().toLowerCase();

    return baseList.filter(meal => {
      if (meal.costPerServing > maxCost) return false;
      for (const flag of activeFlags) {
        if (meal.dietaryFlags && !meal.dietaryFlags[flag]) return false;
      }
      if (containsExcludedIngredient(meal, excludedIngredients)) return false;
      if (query) {
        const titleMatch = meal.name.toLowerCase().includes(query);
        const ingredientMatch = meal.ingredients?.some(i => (i.name || i.food || i.text || '').toLowerCase().includes(query));
        const noteMatch = (recipeNotes[meal.id]?.text || '').toLowerCase().includes(query);
        if (!titleMatch && !ingredientMatch && !noteMatch) return false;
      }
      return true;
    });
  }, [preparedCustom, preparedCommunity, collectionScope, maxCostPerServing, activeFlags, excludedIngredients, deferredSearch, recipeNotes]);

  // Only render a page of results – rendering all 3,000 cards (each with a 28-option
  // dropdown) froze typing in the search box.
  useEffect(() => setVisibleCount(PAGE_SIZE), [collectionScope, maxCostPerServing, activeFlags, excludedIngredients, deferredSearch]);
  const visibleMeals = filteredMeals.slice(0, visibleCount);

  // Calendar Management
  const handleAddMealToSlot = (meal, day, slot) => {
    const entry = {
      id: `slot-${Date.now()}-${Math.random()}`,
      day,
      slot,
      mealId: meal.id,
      servings: 1,
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

  const handleApplyGeneratedPlan = (plan) => {
    setWeeklyPlan(plan);
    setCartAddedKeys([]);
    syncToCloud({ weeklyPlan: plan });
  };

  const handleClearPlan = () => {
    setWeeklyPlan([]);
    setCartAddedKeys([]);
    syncToCloud({ weeklyPlan: [] });
  };

  // USDA Search & Inspection
  const handleUSDASearch = async (e) => {
    e.preventDefault();
    const q = usdaQuery.trim();
    if (!q || usdaLoading) return;

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setUsdaLoading(true);
    setUsdaError('');
    try {
      const results = await searchUSDAFood(q, { signal: controller.signal });
      setUsdaResults(results);
      setUsdaSearched(true);
      const defaults = {};
      results.forEach(r => {
        const d = getDefaultPortion(r);
        defaults[r.fdcId] = { portionId: d.portionId, qty: d.qty };
      });
      setResultPortions(defaults);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('USDA Search failed:', err);
      setUsdaError(err.message || 'USDA search failed.');
    } finally {
      if (searchAbortRef.current === controller) setUsdaLoading(false);
    }
  };

  const setResultPortion = (fdcId, patch) =>
    setResultPortions(prev => ({ ...prev, [fdcId]: { ...(prev[fdcId] || { portionId: '100g', qty: 1 }), ...patch } }));

  const handleInspectUsdaFood = async (item) => {
    setIsInspectingUsda(true);
    setInspectUsdaItem(item);
    const sel = resultPortions[item.fdcId] || getDefaultPortion(item);
    setInspectPortion({ portionId: sel.portionId, qty: sel.qty });
    try {
      if (item.fdcId) {
        const detailedData = await getUSDAFoodDetails(item.fdcId);
        if (detailedData?.fdcId) {
          // Merge so we keep search-result measures AND gain detailed portions/nutrients
          const merged = { ...item, ...detailedData, foodMeasures: item.foodMeasures };
          setInspectUsdaItem(merged);
          const d = getDefaultPortion(merged);
          setInspectPortion({ portionId: d.portionId, qty: d.qty });
        }
      }
    } catch (err) {
      console.error('Failed to fetch detailed USDA info:', err);
      setUsdaError(err.message || 'Could not load full nutrient details. Showing search data.');
    } finally {
      setIsInspectingUsda(false);
    }
  };

  const addUSDAIngredientToRecipe = (food, portionId, qty) => {
    const ing = buildUsdaIngredient(food, portionId, qty);
    if (ing.amount <= 0) return;
    setNewRecipeIngredients(prev => [...prev, ing]);
  };

  const updateNewIngredient = (idx, patch) =>
    setNewRecipeIngredients(prev => prev.map((ing, i) => (i === idx ? updateIngredientPortion(ing, patch) : ing)));

  const removeNewIngredient = (idx) =>
    setNewRecipeIngredients(prev => prev.filter((_, i) => i !== idx));

  const builderTotals = useMemo(
    () => sumMacros(newRecipeIngredients.map(ing => scaleMacros(ing.per100g, ing.amount))),
    [newRecipeIngredients]
  );
  const builderServings = Math.max(1, Number(newRecipeServings) || 1);
  const builderEstimatedCost = useMemo(() => estimateRecipeCost(newRecipeIngredients), [newRecipeIngredients]);

  const flashRecipeMsg = (msg) => {
    setRecipeActionMsg(msg);
    setTimeout(() => setRecipeActionMsg(''), 4000);
  };

  // Toggle public visibility on one of your own recipes
  const handleSetRecipePublic = async (recipe, makePublic) => {
    if (!user) return;
    const updatedRecipes = customRecipes.map(r => (r.id === recipe.id ? { ...r, isPublic: makePublic, userId: user.uid } : r));
    setCustomRecipes(updatedRecipes);
    syncToCloud({ customRecipes: updatedRecipes });
    setViewRecipeModal(m => (m && m.id === recipe.id ? { ...m, isPublic: makePublic } : m));
    try {
      if (makePublic) {
        await publishPublicRecipe(updatedRecipes.find(r => r.id === recipe.id), user);
        flashRecipeMsg('Recipe is now visible to all accounts.');
      } else {
        await unpublishPublicRecipe(recipe.id);
        flashRecipeMsg('Recipe is now private.');
      }
    } catch (err) {
      console.error('Visibility change failed:', err);
      flashRecipeMsg('Could not update sharing. Check your connection and try again.');
    }
  };

  const handleDeleteRecipe = async (recipe) => {
    const updatedRecipes = customRecipes.filter(r => r.id !== recipe.id);
    setCustomRecipes(updatedRecipes);
    const updatedNotes = { ...recipeNotes };
    delete updatedNotes[recipe.id];
    setRecipeNotes(updatedNotes);
    syncToCloud({ customRecipes: updatedRecipes, recipeNotes: updatedNotes });
    setConfirmDeleteId(null);
    setViewRecipeModal(null);
    if (recipe.isPublic && user) {
      unpublishPublicRecipe(recipe.id).catch(err => console.error('Unpublish failed:', err));
    }
  };

  const isOwnRecipe = (r) => customRecipes.some(c => c.id === r?.id);

  // Cooking-instruction steps in the recipe builder
  const updateStep = (idx, text) => setNewRecipeSteps(prev => prev.map((s, i) => (i === idx ? text : s)));
  const addStep = () => setNewRecipeSteps(prev => [...prev, '']);
  const removeStep = (idx) => setNewRecipeSteps(prev => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : ['']));
  const moveStep = (idx, dir) =>
    setNewRecipeSteps(prev => {
      const to = idx + dir;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
  const filledSteps = newRecipeSteps.map(s => s.trim()).filter(Boolean);

  const handleSaveCustomRecipe = () => {
    if (!newRecipeTitle.trim() || newRecipeIngredients.length === 0) return;

    const per = {
      calories: Math.round(builderTotals.calories / builderServings),
      protein: Math.round((builderTotals.protein / builderServings) * 10) / 10,
      carbs: Math.round((builderTotals.carbs / builderServings) * 10) / 10,
      fat: Math.round((builderTotals.fat / builderServings) * 10) / 10
    };
    const costPerServing = Number(newRecipeCost) > 0
      ? Number(newRecipeCost)
      : Math.max(0.25, Math.round((builderEstimatedCost / builderServings) * 100) / 100);

    const newRecipe = {
      id: `custom-${Date.now()}`,
      userId: user?.uid || 'guest',
      name: newRecipeTitle.trim(),
      servings: builderServings,
      costPerServingUSD: costPerServing,
      budgetTier: costPerServing <= 2.5 ? 1 : costPerServing <= 5 ? 2 : 3,
      prepTimeMinutes: 15,
      isPublic: Boolean(isNewRecipePublic && user),
      authorName: user ? publicAuthorName(user) : undefined,
      macros: per, // per serving
      dietaryFlags: { isHalal: true, isVegetarian: false, isDairyFree: true, isNutFree: true, isGlutenFree: true, isKosher: true },
      // Drop the cached option list to keep the saved document small
      ingredients: newRecipeIngredients.map(({ portionOptions, ...rest }) => rest),
      // Same "1. step\n2. step" format as the starter recipes
      instructions: filledSteps.length
        ? filledSteps.map((s, i) => `${i + 1}. ${s.replace(/\s*\n\s*/g, ' ')}`).join('\n')
        : 'Combine ingredients, portion appropriately, and cook to desired preference.'
    };

    const updatedRecipes = [newRecipe, ...customRecipes];
    setCustomRecipes(updatedRecipes);
    if (newRecipe.isPublic) {
      publishPublicRecipe(newRecipe, user)
        .then(() => flashRecipeMsg(`"${newRecipe.name}" is now visible to all accounts.`))
        .catch(err => {
          console.error('Publish failed:', err);
          flashRecipeMsg('Saved to your account, but sharing publicly failed. Try "Make public" again from the recipe.');
        });
    }
    setNewRecipeTitle('');
    setNewRecipeIngredients([]);
    setNewRecipeServings(1);
    setNewRecipeCost('');
    setNewRecipeSteps(['']);
    setIsNewRecipePublic(false);
    syncToCloud({ customRecipes: updatedRecipes });
  };

  // Consolidated Grocery List & store shopping items
  const groceryList = useMemo(() => consolidateGroceryList(weeklyPlan), [weeklyPlan]);
  const shoppingItems = useMemo(() => buildShoppingItems(groceryList, { hidePantry }), [groceryList, hidePantry]);
  const store = STORES[preferredStore];

  const toggleCartAdded = (key) =>
    setCartAddedKeys(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));

  const handleCopyList = async () => {
    try {
      await navigator.clipboard.writeText(listAsText(shoppingItems, preferredStore));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  // Daily totals vs targets for the calendar
  const targets = useMemo(() => (validateProfile(profile).length ? null : calculateTargets(profile)), [profile]);
  const dayTotals = useMemo(() => {
    const out = {};
    DAYS.forEach(d => { out[d] = planTotals(weeklyPlan.filter(p => p.day === d)); });
    return out;
  }, [weeklyPlan]);
  const weekCost = useMemo(() => planTotals(weeklyPlan).cost, [weeklyPlan]);

  // Inspector derived values
  const inspectOptions = useMemo(() => getPortionOptions(inspectUsdaItem), [inspectUsdaItem]);
  const inspectGrams = (inspectOptions.find(o => o.id === inspectPortion.portionId)?.grams || 100) * (Number(inspectPortion.qty) || 0);
  const inspectMacros = useMemo(
    () => (inspectUsdaItem ? scaleMacros(getMacrosPer100g(inspectUsdaItem), inspectGrams) : null),
    [inspectUsdaItem, inspectGrams]
  );

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header & Theme Selection */}
      <header className="op-header flex flex-wrap justify-between items-center gap-4 border-b border-gray-700 pb-4">
        <div>
          <h1 className="op-title text-2xl md:text-3xl font-extrabold tracking-tight">OmniPath Nutrition</h1>
          <p className="text-xs opacity-75">Recipe Builder, Weekly Planner & Multi-Store Grocery Sync</p>
        </div>

        <div className="flex items-center gap-4">
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
            <button onClick={() => auth && signOut(auth)} className="text-xs border px-3 py-1.5 rounded">
              Log Out ({user.email})
            </button>
          ) : (
            <button onClick={() => setIsAuthOpen(true)} className="text-xs op-btn-primary px-3 py-1.5 rounded font-bold">
              Log In / Sign Up
            </button>
          )}
        </div>
      </header>

      {/* Settings: Store, Budget, Dietary */}
      {/* relative z-20 keeps the ingredient dropdown above the cards below */}
      <div className="relative z-20 grid grid-cols-1 md:grid-cols-3 gap-4 op-card p-4">
        <div>
          <label className="text-xs font-bold uppercase block mb-2">Preferred Store</label>
          <div className="flex gap-2" role="radiogroup" aria-label="Preferred store">
            {STORE_IDS.map((id) => (
              <button
                key={id}
                role="radio"
                aria-checked={preferredStore === id}
                onClick={() => handleStoreChange(id)}
                className={`flex-1 py-1 text-xs font-semibold rounded ${
                  preferredStore === id ? `${STORES[id].color} text-white` : 'op-toggle'
                }`}
              >
                {STORES[id].name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="maxCostInput" className="text-xs font-bold uppercase block mb-2">Max Cost per Serving</label>
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs opacity-70 pointer-events-none">$</span>
              <input
                id="maxCostInput"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.25"
                placeholder="Any"
                value={maxCostPerServing}
                onChange={(e) => handleMaxCostChange(e.target.value)}
                className="w-full py-1 pl-5 pr-2 text-xs rounded border border-gray-600 bg-transparent font-semibold"
              />
            </div>
            {maxCostPerServing !== '' && (
              <button
                type="button"
                onClick={() => handleMaxCostChange('')}
                className="px-2 py-1 text-xs font-semibold rounded op-toggle"
              >
                Any
              </button>
            )}
          </div>
          <p className="text-[10px] opacity-60 mt-1">
            {maxCostLimit(maxCostPerServing) === Infinity
              ? 'Leave blank to show recipes at any cost.'
              : `Showing recipes ≤ $${maxCostLimit(maxCostPerServing).toFixed(2)} per serving.`}
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase block mb-2">Dietary Filters</label>
            <div className="flex flex-wrap gap-1.5">
              {dietaryFlagsList.map(flag => (
                <button
                  key={flag.id}
                  onClick={() => toggleFlag(flag.id)}
                  className={`op-chip px-2 py-0.5 text-[11px] font-semibold rounded-full ${
                    activeFlags.includes(flag.id) ? 'op-btn-primary op-active' : 'op-toggle'
                  }`}
                >
                  {flag.label}
                </button>
              ))}
            </div>
          </div>
          <IngredientExcludeFilter
            options={ingredientOptions}
            selected={excludedIngredients}
            onChange={handleExcludedChange}
          />
        </div>
      </div>

      {/* Meal Plan Generator */}
      <MealPlanGenerator
        profile={profile}
        onProfileChange={handleProfileChange}
        meals={dietaryEligibleMeals}
        onApplyPlan={handleApplyGeneratedPlan}
        hasExistingPlan={weeklyPlan.length > 0}
      />

      {/* Main Feature Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 1. Recipe Collection */}
        <div className="space-y-4 op-card p-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h2 className="op-heading text-lg font-bold">Recipes ({filteredMeals.length})</h2>
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

          {publicError && <p className="text-xs text-yellow-400">⚠ {publicError}</p>}

          <div className="max-h-[480px] overflow-y-auto space-y-3 pr-2">
            {visibleMeals.map((meal) => (
              <div
                key={meal.id}
                onClick={() => setViewRecipeModal(meal)}
                className="op-item cursor-pointer p-3 space-y-2 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-sm underline-offset-2 hover:underline">{meal.name}</h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded op-badge shrink-0">
                    {meal.id.startsWith('custom') ? (meal.isPublic ? 'Public' : 'Custom') : 'Starter'}
                  </span>
                </div>
                {meal.isPublic && !isOwnRecipe(meal) && (
                  <p className="text-[10px] opacity-60">Shared by {meal.authorName || 'Community member'}</p>
                )}
                <p className="text-xs opacity-75">
                  Per serving: {meal.perServing.calories} kcal | P: {meal.perServing.protein}g | C: {meal.perServing.carbs}g | F: {meal.perServing.fat}g
                </p>
                <p className="text-[10px] opacity-60">Serves {meal.servings} · ~${meal.costPerServing.toFixed(2)}/serving (est.)</p>
                {recipeNotes[meal.id] && (
                  <p className="text-[10px] italic opacity-80 truncate" title={recipeNotes[meal.id].text}>
                    📝 {recipeNotes[meal.id].text}
                  </p>
                )}

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
                  <option value="">+ Add 1 serving to Day & Slot...</option>
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
            {filteredMeals.length > visibleCount && (
              <button
                type="button"
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                className="w-full py-1.5 text-xs border border-gray-600 rounded font-semibold"
              >
                Show more ({filteredMeals.length - visibleCount} remaining)
              </button>
            )}
            {filteredMeals.length === 0 && (
              <p className="text-xs opacity-75">
                {collectionScope === 'public' && !user
                  ? 'Log in to see recipes shared by the community.'
                  : 'No recipes match. Try a different search, a higher cost limit, or fewer dietary or ingredient filters.'}
              </p>
            )}
          </div>
        </div>

        {/* 2. Custom Recipe Builder (with Public Toggle & USDA) */}
        <div className="op-card p-4 space-y-4">
          <h2 className="op-heading text-lg font-bold">Custom Recipe Builder</h2>
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
              checked={isNewRecipePublic && !!user}
              disabled={!user}
              onChange={(e) => setIsNewRecipePublic(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="makePublicToggle" className={`text-xs font-semibold ${user ? 'cursor-pointer' : 'opacity-60'}`}>
              Make Public for all accounts to see{!user && ' (log in to share)'}
            </label>
          </div>
          {recipeActionMsg && <p className="text-xs text-green-400">{recipeActionMsg}</p>}

          <form onSubmit={handleUSDASearch} className="flex gap-2">
            <input
              type="text"
              placeholder="Search USDA ingredients..."
              value={usdaQuery}
              onChange={(e) => setUsdaQuery(e.target.value)}
              className="flex-1 p-2 text-xs rounded border bg-transparent"
            />
            <button
              type="submit"
              disabled={usdaLoading || !usdaQuery.trim()}
              className="px-3 py-1 text-xs op-btn-primary font-bold rounded disabled:opacity-50"
            >
              {usdaLoading ? 'Searching…' : 'Search'}
            </button>
          </form>

          {usdaError && (
            <div className="text-xs p-2 op-alert-error">{usdaError}</div>
          )}
          {IS_DEMO_KEY && !usdaError && (
            <p className="text-[10px] opacity-60">
              Using the shared USDA DEMO_KEY (limited to about 30 searches/hour). Add your own free key as VITE_USDA_API_KEY.
            </p>
          )}

          {/* USDA Search Results with serving-size picker */}
          <div className="max-h-[220px] overflow-y-auto space-y-1.5">
            {usdaSearched && !usdaLoading && usdaResults.length === 0 && !usdaError && (
              <p className="text-xs opacity-75">No USDA matches. Try a simpler term (e.g. "chicken breast").</p>
            )}
            {usdaResults.map((item) => {
              const options = getPortionOptions(item);
              const sel = resultPortions[item.fdcId] || { portionId: '100g', qty: 1 };
              return (
                <div key={item.fdcId} className="p-1.5 border border-gray-700 rounded text-xs space-y-1">
                  <div className="flex justify-between items-center gap-2">
                    <span className="truncate" title={item.description}>{item.description}</span>
                    <span className="text-[9px] opacity-60 shrink-0">{item.brandOwner || item.dataType}</span>
                  </div>
                  <div className="flex gap-1 items-center">
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={sel.qty}
                      onChange={(e) => setResultPortion(item.fdcId, { qty: e.target.value })}
                      className="w-14 p-0.5 text-[11px] rounded border border-gray-600 bg-transparent"
                      aria-label="Quantity"
                    />
                    <select
                      value={sel.portionId}
                      onChange={(e) => setResultPortion(item.fdcId, { portionId: e.target.value })}
                      className="flex-1 min-w-0 p-0.5 text-[11px] rounded border border-gray-600 bg-transparent"
                      aria-label="Serving size"
                    >
                      {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleInspectUsdaFood(item)}
                      className="px-2 py-0.5 text-[10px] bg-blue-600 text-white rounded font-bold"
                    >
                      Inspect
                    </button>
                    <button
                      type="button"
                      onClick={() => addUSDAIngredientToRecipe(item, sel.portionId, sel.qty)}
                      className="px-2 py-0.5 text-[10px] bg-green-600 text-white rounded font-bold"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Current Recipe Ingredients (editable serving sizes) */}
          <div>
            <h4 className="text-xs font-bold uppercase mb-1">Selected Ingredients ({newRecipeIngredients.length})</h4>
            <div className="space-y-1 max-h-[180px] overflow-y-auto">
              {newRecipeIngredients.map((ing, idx) => (
                <div key={idx} className="text-xs p-1 bg-black/20 rounded space-y-1">
                  <div className="flex justify-between gap-2">
                    <span className="truncate" title={ing.name}>{ing.name}</span>
                    <button onClick={() => removeNewIngredient(idx)} className="text-red-400 font-bold leading-none" aria-label={`Remove ${ing.name}`}>×</button>
                  </div>
                  <div className="flex gap-1 items-center">
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={ing.qty}
                      onChange={(e) => updateNewIngredient(idx, { qty: e.target.value })}
                      className="w-14 p-0.5 text-[11px] rounded border border-gray-600 bg-transparent"
                      aria-label="Quantity"
                    />
                    <select
                      value={ing.portionId}
                      onChange={(e) => updateNewIngredient(idx, { portionId: e.target.value })}
                      className="flex-1 min-w-0 p-0.5 text-[11px] rounded border border-gray-600 bg-transparent"
                      aria-label="Serving size"
                    >
                      {(ing.portionOptions || []).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <span className="opacity-75 text-[10px] shrink-0">
                      {ing.amount}g · {scaleMacros(ing.per100g, ing.amount).calories} kcal
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {newRecipeIngredients.length > 0 && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] font-bold uppercase">
                  Servings
                  <input
                    type="number"
                    min="1"
                    value={newRecipeServings}
                    onChange={(e) => setNewRecipeServings(e.target.value)}
                    className="w-full mt-1 p-1 text-xs rounded border border-gray-600 bg-transparent normal-case font-normal"
                  />
                </label>
                <label className="text-[10px] font-bold uppercase">
                  Cost / serving ($)
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    placeholder={`est. ${(builderEstimatedCost / builderServings).toFixed(2)}`}
                    value={newRecipeCost}
                    onChange={(e) => setNewRecipeCost(e.target.value)}
                    className="w-full mt-1 p-1 text-xs rounded border border-gray-600 bg-transparent normal-case font-normal"
                  />
                </label>
              </div>
              <p className="text-[11px] opacity-80">
                Per serving: {Math.round(builderTotals.calories / builderServings)} kcal ·
                P {Math.round(builderTotals.protein / builderServings)}g ·
                C {Math.round(builderTotals.carbs / builderServings)}g ·
                F {Math.round(builderTotals.fat / builderServings)}g
              </p>
            </div>
          )}

          {/* Cooking instructions (numbered steps) */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold uppercase">Cooking Instructions ({filledSteps.length} step{filledSteps.length === 1 ? '' : 's'})</h4>
              <button type="button" onClick={addStep} className="text-[10px] font-bold px-2 py-0.5 rounded op-toggle">
                + Add step
              </button>
            </div>
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
              {newRecipeSteps.map((step, idx) => (
                <div key={idx} className="flex gap-1.5 items-start">
                  <span className="text-[11px] font-bold opacity-70 w-4 pt-1.5 text-right shrink-0">{idx + 1}.</span>
                  <textarea
                    rows={2}
                    value={step}
                    placeholder={idx === 0 ? 'e.g. Preheat the oven to 400°F and line a sheet pan.' : 'Next step…'}
                    onChange={(e) => updateStep(idx, e.target.value)}
                    onKeyDown={(e) => {
                      // Ctrl/Cmd + Enter adds a new step below
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addStep(); }
                    }}
                    className="flex-1 min-w-0 p-1.5 text-xs rounded border border-gray-600 bg-transparent resize-y"
                    aria-label={`Step ${idx + 1}`}
                  />
                  <div className="flex flex-col text-[10px] leading-none shrink-0">
                    <button type="button" onClick={() => moveStep(idx, -1)} disabled={idx === 0} className="px-1 py-0.5 disabled:opacity-30" aria-label={`Move step ${idx + 1} up`}>▲</button>
                    <button type="button" onClick={() => moveStep(idx, 1)} disabled={idx === newRecipeSteps.length - 1} className="px-1 py-0.5 disabled:opacity-30" aria-label={`Move step ${idx + 1} down`}>▼</button>
                    <button type="button" onClick={() => removeStep(idx)} className="px-1 py-0.5 text-red-400 font-bold" aria-label={`Remove step ${idx + 1}`}>×</button>
                  </div>
                </div>
              ))}
            </div>
            {filledSteps.length === 0 && (
              <p className="text-[10px] opacity-60">Optional – if left blank, generic instructions are saved.</p>
            )}
          </div>

          <button
            onClick={handleSaveCustomRecipe}
            disabled={!newRecipeTitle || newRecipeIngredients.length === 0}
            className="w-full py-2 text-xs font-bold op-btn-primary rounded disabled:opacity-50"
          >
            Save Custom Recipe
          </button>
        </div>

        {/* 3. Shopping List → Preferred Store */}
        <div className="op-card p-4 space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h2 className="op-heading text-lg font-bold">Shopping List ({shoppingItems.length} Items)</h2>
            <span className={`text-[10px] px-2 py-0.5 rounded text-white font-bold ${store.color}`}>{store.name}</span>
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={hidePantry}
              onChange={(e) => { setHidePantry(e.target.checked); syncToCloud({ hidePantry: e.target.checked }); }}
            />
            Hide pantry staples (salt, pepper, oil, flour…)
          </label>

          {shoppingItems.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => setIsCartOpen(true)}
                  className={`w-full py-2 text-xs text-white font-bold rounded ${store.color}`}
                >
                  Send {shoppingItems.length} items to {store.name} cart
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleCopyList}
                    className="w-full py-1.5 text-xs op-btn-secondary font-bold"
                  >
                    {copied ? 'Copied ✓' : 'Copy list'}
                  </button>
                  <button
                    onClick={() => exportMealPlanToWord('My OmniPath Weekly Schedule', weeklyPlan, groceryList, recipeNotes)}
                    className="w-full py-1.5 text-xs op-btn-secondary font-bold"
                  >
                    Export to .DOCX
                  </button>
                </div>
                <p className="text-[10px] opacity-60">
                  Est. grocery cost for this plan: ${weekCost.toFixed(2)}
                  {targets ? ` · budget $${Number(profile.weeklyBudget).toFixed(2)}` : ''}
                </p>
              </div>

              <div className="max-h-[280px] overflow-y-auto space-y-1 border-t border-gray-700 pt-3">
                {shoppingItems.map((item) => {
                  const added = cartAddedKeys.includes(item.key);
                  return (
                    <label key={item.key} className="p-2 border border-gray-700 rounded text-xs flex justify-between items-center gap-2 cursor-pointer">
                      <span className="flex items-center gap-2">
                        <input type="checkbox" checked={added} onChange={() => toggleCartAdded(item.key)} />
                        <span className={`capitalize ${added ? 'line-through opacity-50' : ''}`}>{item.name}</span>
                      </span>
                      <span className="font-bold shrink-0">{item.qtyLabel}</span>
                    </label>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-xs opacity-75">Generate a plan or assign recipes to days in the weekly schedule below to populate your list.</p>
          )}
        </div>
      </div>

      {/* 4. Weekly Day & Slot Meal Schedule */}
      <div className="op-card p-4 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="op-heading text-lg font-bold">Weekly Meal Schedule</h2>
          {weeklyPlan.length > 0 && (
            <button onClick={handleClearPlan} className="text-xs border border-gray-600 px-2 py-1 rounded">Clear week</button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {DAYS.map((day) => {
            const t = dayTotals[day];
            return (
              <div key={day} className="op-day p-2 space-y-2">
                <div className="text-center border-b border-gray-700 pb-1">
                  <h3 className="font-bold text-xs">{day}</h3>
                  {t.calories > 0 && (
                    <p className="text-[10px] opacity-70">
                      {Math.round(t.calories)}{targets ? `/${targets.calories}` : ''} kcal · P {Math.round(t.protein)}g
                    </p>
                  )}
                </div>
                {SLOTS.map((slot) => {
                  const items = weeklyPlan.filter(p => p.day === day && p.slot === slot);
                  return (
                    <div key={slot} className="space-y-1">
                      <span className="text-[10px] font-semibold opacity-60 uppercase">{slot}</span>
                      {items.map(entry => (
                        <div
                          key={entry.id}
                          onClick={() => setViewRecipeModal({ ...entry.mealData, plannedServings: entry.servings })}
                          className="p-1.5 op-entry cursor-pointer rounded text-[11px] flex justify-between items-start"
                        >
                          <span className="font-medium truncate pr-1">
                            {entry.mealData?.name}
                            <span className="opacity-60"> ×{fmtServ(entry.servings || 1)}</span>
                          </span>
                          <button
                            onClick={(e) => handleRemoveFromSlot(entry.id, e)}
                            className="text-red-400 font-bold text-xs leading-none"
                            aria-label="Remove"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal 1: Recipe Details View */}
      {viewRecipeModal && (
        <div className="fixed inset-0 op-backdrop flex items-center justify-center p-4 z-50">
          <div className="op-modal p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-gray-700 pb-2">
              <div>
                <h3 className="op-modal-title text-xl font-bold">{viewRecipeModal.name}</h3>
                <p className="text-xs opacity-70">
                  Recipe makes {viewRecipeModal.servings} serving(s)
                  {viewRecipeModal.plannedServings ? ` · planned: ${fmtServ(viewRecipeModal.plannedServings)}` : ''}
                  {' · '}~${viewRecipeModal.costPerServing?.toFixed(2)}/serving
                </p>
                {viewRecipeModal.isPublic && !isOwnRecipe(viewRecipeModal) && (
                  <p className="text-xs opacity-70">Shared by {viewRecipeModal.authorName || 'Community member'}</p>
                )}
              </div>
              <button onClick={() => setViewRecipeModal(null)} className="font-bold text-lg">×</button>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center text-xs op-stat p-2">
              <div><span className="block font-bold">Calories</span>{viewRecipeModal.perServing?.calories || 0} kcal</div>
              <div><span className="block font-bold">Protein</span>{viewRecipeModal.perServing?.protein || 0}g</div>
              <div><span className="block font-bold">Carbs</span>{viewRecipeModal.perServing?.carbs || 0}g</div>
              <div><span className="block font-bold">Fat</span>{viewRecipeModal.perServing?.fat || 0}g</div>
              <div className="col-span-4 text-[10px] opacity-60">per serving</div>
            </div>

            <div>
              <h4 className="font-bold text-xs uppercase mb-1">Ingredients (whole recipe):</h4>
              <ul className="list-disc list-inside text-xs space-y-1">
                {viewRecipeModal.ingredients?.map((ing, i) => (
                  <li key={i}>
                    {ing.name || ing.text || ing.food} — {ing.qty && ing.portionLabel ? `${ing.qty} × ${ing.portionLabel}` : `${ing.amount || ing.weight || 1}${ing.unit || ing.measure || 'g'}`}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-xs uppercase mb-1">Instructions:</h4>
              <p className="text-xs opacity-90 leading-relaxed whitespace-pre-line">{viewRecipeModal.instructions || 'Combine ingredients and prepare as desired.'}</p>
            </div>

            {/* Personal notes – private to the signed-in account, on any recipe */}
            <div className="border-t border-gray-700 pt-3 space-y-1.5">
              <div className="flex justify-between items-center">
                <label htmlFor="recipeNoteInput" className="font-bold text-xs uppercase">My Notes</label>
                {user && <span className="text-[10px] opacity-60">Only visible to you</span>}
              </div>
              {user ? (
                <>
                  <textarea
                    id="recipeNoteInput"
                    rows={3}
                    maxLength={MAX_NOTE_LENGTH}
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="e.g. Used half the salt, added spinach. Kids loved it."
                    className="w-full p-2 text-xs rounded border border-gray-600 bg-transparent resize-y"
                  />
                  <div className="flex gap-2 items-center">
                    <button
                      type="button"
                      onClick={() => saveRecipeNote(viewRecipeModal.id, noteDraft)}
                      disabled={noteDraft.trim() === (recipeNotes[viewRecipeModal.id]?.text || '')}
                      className="px-3 py-1 text-xs font-bold op-btn-primary rounded disabled:opacity-50"
                    >
                      Save note
                    </button>
                    {recipeNotes[viewRecipeModal.id] && (
                      <button
                        type="button"
                        onClick={() => saveRecipeNote(viewRecipeModal.id, '')}
                        className="px-3 py-1 text-xs font-bold border border-red-500 text-red-400 rounded"
                      >
                        Delete note
                      </button>
                    )}
                    <span className="text-[10px] opacity-60 ml-auto">{noteDraft.length}/{MAX_NOTE_LENGTH}</span>
                  </div>
                  {noteStatus && <p className="text-xs text-green-400">{noteStatus}</p>}
                </>
              ) : (
                <p className="text-[11px] opacity-70">
                  <button type="button" onClick={() => setIsAuthOpen(true)} className="underline font-semibold">Log in</button>
                  {' '}to add personal notes to this recipe.
                </p>
              )}
            </div>

            {isOwnRecipe(viewRecipeModal) && (
              <div className="flex gap-2 border-t border-gray-700 pt-3">
                {user ? (
                  <button
                    onClick={() => handleSetRecipePublic(viewRecipeModal, !viewRecipeModal.isPublic)}
                    className="flex-1 py-1.5 text-xs font-bold border border-gray-500 rounded"
                  >
                    {viewRecipeModal.isPublic ? 'Make private' : 'Make public'}
                  </button>
                ) : (
                  <span className="flex-1 text-[11px] opacity-60 self-center">Log in to share this recipe publicly.</span>
                )}
                {confirmDeleteId === viewRecipeModal.id ? (
                  <button
                    onClick={() => handleDeleteRecipe(viewRecipeModal)}
                    className="flex-1 py-1.5 text-xs font-bold bg-red-600 text-white rounded"
                  >
                    Confirm delete
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(viewRecipeModal.id)}
                    className="flex-1 py-1.5 text-xs font-bold border border-red-500 text-red-400 rounded"
                  >
                    Delete recipe
                  </button>
                )}
              </div>
            )}
            {recipeActionMsg && <p className="text-xs text-green-400">{recipeActionMsg}</p>}

            <button onClick={() => { setViewRecipeModal(null); setConfirmDeleteId(null); }} className="w-full py-2 op-btn-primary text-xs font-bold rounded">
              Close Recipe
            </button>
          </div>
        </div>
      )}

      {/* Modal 2: USDA Ingredient Inspector */}
      {inspectUsdaItem && (
        <div className="fixed inset-0 op-backdrop flex items-center justify-center p-4 z-50">
          <div className="op-modal p-6 max-w-md w-full space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-gray-700 pb-2">
              <div>
                <h3 className="op-heading text-lg font-bold">{inspectUsdaItem.description || inspectUsdaItem.name}</h3>
                <p className="text-xs opacity-75">FDC ID: {inspectUsdaItem.fdcId} | Brand: {inspectUsdaItem.brandOwner || 'Generic / USDA'}</p>
              </div>
              <button onClick={() => setInspectUsdaItem(null)} className="font-bold text-lg">×</button>
            </div>

            <div className="flex gap-1 items-center">
              <input
                type="number"
                min="0"
                step="0.25"
                value={inspectPortion.qty}
                onChange={(e) => setInspectPortion(p => ({ ...p, qty: e.target.value }))}
                className="w-16 p-1 text-xs rounded border border-gray-600 bg-transparent"
                aria-label="Quantity"
              />
              <select
                value={inspectPortion.portionId}
                onChange={(e) => setInspectPortion(p => ({ ...p, portionId: e.target.value }))}
                className="flex-1 min-w-0 p-1 text-xs rounded border border-gray-600 bg-transparent"
                aria-label="Serving size"
              >
                {inspectOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>

            {inspectMacros && (
              <div className="grid grid-cols-4 gap-2 text-center text-xs op-stat p-2">
                <div><span className="block font-bold">Calories</span>{inspectMacros.calories}</div>
                <div><span className="block font-bold">Protein</span>{inspectMacros.protein}g</div>
                <div><span className="block font-bold">Carbs</span>{inspectMacros.carbs}g</div>
                <div><span className="block font-bold">Fat</span>{inspectMacros.fat}g</div>
              </div>
            )}

            {isInspectingUsda ? (
              <p className="text-xs text-center py-4">Fetching full nutrient breakdown...</p>
            ) : (
              <div className="space-y-3">
                <h4 className="font-bold text-xs uppercase">Nutrients for {Math.round(inspectGrams)} g:</h4>
                <div className="max-h-[220px] overflow-y-auto space-y-1 border border-gray-700 p-2 rounded text-xs bg-black/10">
                  {inspectUsdaItem.foodNutrients?.length ? inspectUsdaItem.foodNutrients
                    .filter(n => typeof (n.value ?? n.amount) === 'number')
                    .map((n, i) => (
                      <div key={i} className="flex justify-between py-0.5 border-b border-gray-800">
                        <span>{n.nutrientName || n.nutrient?.name || 'Nutrient'}</span>
                        <span className="font-bold">
                          {Math.round(((n.value ?? n.amount) * inspectGrams) / 100 * 100) / 100} {(n.unitName || n.nutrient?.unitName || 'g').toLowerCase()}
                        </span>
                      </div>
                    )) : <p className="text-xs opacity-75">No nutrient data available for this item.</p>}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      addUSDAIngredientToRecipe(inspectUsdaItem, inspectPortion.portionId, inspectPortion.qty);
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

      {/* Modal 3: Send to store cart */}
      {isCartOpen && (
        <CartBuilderModal
          storeId={preferredStore}
          items={shoppingItems}
          addedKeys={cartAddedKeys}
          onToggleAdded={toggleCartAdded}
          onClose={() => setIsCartOpen(false)}
        />
      )}

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} user={user} />
    </div>
  );
}
