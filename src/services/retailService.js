// src/services/retailService.js
// Preferred-store shopping (front-end only).
//
// None of these stores allow a static website to drop items straight into a
// customer's cart without server-side credentials (Kroger's Cart API needs OAuth with
// a client secret; Publix is served through Instacart's partner API; Walmart cart links
// need Walmart item IDs from its affiliate API). So the app does the next best thing:
// it walks the list one item at a time, opening each item's search on the chosen store
// in a single reusable tab, where you tap "Add to cart". If you're signed in to the store
// (or have its app installed on mobile), items land directly in your cart.

import { PANTRY_STAPLES } from '../data/ingredientPrices';

export const STORES = {
  kroger: {
    id: 'kroger',
    name: 'Kroger',
    color: 'bg-blue-600',
    searchUrl: term => `https://www.kroger.com/search?query=${encodeURIComponent(term)}&searchType=default_search`,
    cartUrl: 'https://www.kroger.com/cart'
  },
  walmart: {
    id: 'walmart',
    name: 'Walmart',
    color: 'bg-yellow-600',
    searchUrl: term => `https://www.walmart.com/search?q=${encodeURIComponent(term)}`,
    cartUrl: 'https://www.walmart.com/cart'
  },
  publix: {
    id: 'publix',
    name: 'Publix',
    color: 'bg-green-600',
    // Publix online ordering runs on Instacart
    searchUrl: term => `https://www.instacart.com/store/publix/s?k=${encodeURIComponent(term)}`,
    cartUrl: 'https://www.instacart.com/store/publix/storefront'
  }
};

export const STORE_IDS = Object.keys(STORES);
const STORE_TAB_NAME = 'omnipath-store-tab';

const normalize = s => s.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
const PANTRY_SET = new Set(PANTRY_STAPLES.map(normalize));
const PANTRY_RE = /\b(salt|black pepper|white pepper|ground pepper|pepper|peppercorns?|water|ice|(?:olive|vegetable|canola|cooking|sesame|avocado) oil|oil|cooking spray|(?:all purpose |plain |bread )?flour|(?:white |brown |granulated |caster |powdered )?sugar|baking soda|baking powder|vanilla(?: extract)?|cinnamon|cumin|paprika|oregano|thyme|chili powder|garlic powder|onion powder|red pepper flakes|nutmeg|bay lea(?:f|ves)|soy sauce|(?:white |apple cider |balsamic |red wine )?vinegar)$/;

export function isPantryStaple(name = '') {
  const n = normalize(name);
  if (PANTRY_SET.has(n)) return true;
  // "kosher salt", "freshly ground black pepper", "extra virgin olive oil"... but not "bell pepper"
  if (/\b(bell|jalape\w*|chil\w*|serrano|poblano|banana|sweet|red|green|yellow|orange)\b.*pepper/.test(n) && !/flakes|powder/.test(n)) return false;
  return PANTRY_RE.test(n);
}

/** Human-friendly purchase quantity, e.g. 680 g -> "1.5 lb", 85 g -> "3 oz". */
export function formatPurchaseQty(item) {
  if (item.unit !== 'g') return `${Math.ceil(item.amount)} ${item.unit}`;
  const grams = item.amount;
  if (grams >= 453.592) {
    const lb = Math.ceil((grams / 453.592) * 4) / 4;
    return `${lb} lb`;
  }
  const oz = Math.max(1, Math.ceil(grams / 28.3495));
  return `${oz} oz`;
}

/** Turn the consolidated grocery list into shopping items for a store. */
export function buildShoppingItems(groceryList, { hidePantry = true } = {}) {
  return groceryList
    .filter(i => !(hidePantry && isPantryStaple(i.name)))
    .map(i => ({
      key: `${i.name.toLowerCase()}_${i.unit}`,
      name: i.name,
      searchTerm: i.name.replace(/\s+/g, ' ').trim(),
      qtyLabel: formatPurchaseQty(i),
      grams: i.unit === 'g' ? i.amount : null
    }));
}

export function getItemUrl(storeId, item) {
  return STORES[storeId].searchUrl(item.searchTerm);
}

/** Open (or reuse) one store tab so stepping through items doesn't spawn dozens of tabs. */
export function openInStoreTab(url) {
  const w = window.open(url, STORE_TAB_NAME);
  if (w) w.focus?.();
  return !!w;
}

export function listAsText(items, storeId) {
  const store = STORES[storeId]?.name || 'Store';
  return [`${store} shopping list (OmniPath Nutrition)`, ...items.map(i => `☐ ${i.name} — ${i.qtyLabel}`)].join('\n');
}
