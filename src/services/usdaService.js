// src/services/usdaService.js
// USDA FoodData Central client with caching and rate-limit-aware errors.
//
// WHY THE SEARCH "STOPPED WORKING": the app was running on api.data.gov's DEMO_KEY,
// which is limited to roughly 30 requests/hour and 50 requests/day per IP address.
// Every search AND every "Inspect" click used one request. After the quota was spent
// the API answered with HTTP 429 (OVER_RATE_LIMIT), the old code only logged that to
// the console, and the results list silently stopped updating.
// Fix: use a free personal key (https://fdc.nal.usda.gov/api-key-signup), cache
// results so repeat searches cost nothing, and surface errors in the UI.

const USDA_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';
const API_KEY = import.meta.env.VITE_USDA_API_KEY || 'DEMO_KEY';
export const IS_DEMO_KEY = API_KEY === 'DEMO_KEY';

const CACHE_PREFIX = 'omnipath.usda.';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const memoryCache = new Map();

export class UsdaApiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'UsdaApiError';
    this.code = code; // 'RATE_LIMIT' | 'BAD_KEY' | 'NETWORK' | 'HTTP'
  }
}

function readCache(key) {
  if (memoryCache.has(key)) return memoryCache.get(key);
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw);
    if (Date.now() - t > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    memoryCache.set(key, v);
    return v;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  memoryCache.set(key, value);
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
  } catch {
    // Storage full or blocked (private mode) – memory cache still works.
  }
}

async function usdaFetch(path, signal) {
  let response;
  try {
    const sep = path.includes('?') ? '&' : '?';
    response = await fetch(`${USDA_BASE_URL}${path}${sep}api_key=${API_KEY}`, { signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new UsdaApiError('Could not reach the USDA database. Check your connection and try again.', 'NETWORK');
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // non-JSON error body
  }

  const apiErrorCode = body?.error?.code;
  if (response.status === 429 || apiErrorCode === 'OVER_RATE_LIMIT') {
    throw new UsdaApiError(
      IS_DEMO_KEY
        ? 'USDA search limit reached. The app is using the shared DEMO_KEY (about 30 searches/hour, 50/day). Add your own free key as VITE_USDA_API_KEY to fix this.'
        : 'USDA hourly request limit reached. Please wait a few minutes and try again.',
      'RATE_LIMIT'
    );
  }
  if (response.status === 403 || apiErrorCode === 'API_KEY_INVALID' || apiErrorCode === 'API_KEY_MISSING') {
    throw new UsdaApiError('The USDA API key is missing or invalid. Check VITE_USDA_API_KEY.', 'BAD_KEY');
  }
  if (!response.ok) {
    throw new UsdaApiError(`USDA request failed (HTTP ${response.status}).`, 'HTTP');
  }
  return body;
}

// Keep only what the UI needs so cached entries stay small.
function slimSearchFood(f) {
  return {
    fdcId: f.fdcId,
    description: f.description,
    dataType: f.dataType,
    brandOwner: f.brandOwner,
    brandName: f.brandName,
    servingSize: f.servingSize,
    servingSizeUnit: f.servingSizeUnit,
    householdServingFullText: f.householdServingFullText,
    foodMeasures: (f.foodMeasures || []).map(m => ({
      disseminationText: m.disseminationText,
      gramWeight: m.gramWeight,
      rank: m.rank
    })),
    foodNutrients: (f.foodNutrients || []).map(n => ({
      nutrientId: n.nutrientId,
      nutrientNumber: n.nutrientNumber,
      nutrientName: n.nutrientName,
      unitName: n.unitName,
      value: n.value
    }))
  };
}

export async function searchUSDAFood(query, { signal } = {}) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const key = `search:${q}`;
  const cached = readCache(key);
  if (cached) return cached;

  const data = await usdaFetch(`/foods/search?query=${encodeURIComponent(q)}&pageSize=25`, signal);
  const foods = (data?.foods || []).map(slimSearchFood);
  writeCache(key, foods);
  return foods;
}

export async function getUSDAFoodDetails(fdcId, { signal } = {}) {
  const key = `food:${fdcId}`;
  const cached = readCache(key);
  if (cached) return cached;

  const data = await usdaFetch(`/food/${fdcId}`, signal);
  writeCache(key, data);
  return data;
}
