import { db } from '../config/firebase';
import {
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';

const PUBLIC_RECIPES = 'publicRecipes';
const PUBLIC_FEED_LIMIT = 500;

export async function saveUserData(userId, userData) {
  if (!userId || !db) return;
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, {
    ...clean(userData),
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

export async function getUserData(userId) {
  if (!userId || !db) return null;
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  return snap.exists() ? snap.data() : null;
}

// Firestore rejects `undefined` values – strip them (and any functions) before writing.
function clean(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

// Public display name only – never store or show the author's email address.
export function publicAuthorName(user) {
  return (user?.displayName || '').trim().slice(0, 60) || 'Community member';
}

// ---------- Public community recipes (shared across all accounts) ----------
// Each public recipe is copied to /publicRecipes/{recipeId}. Every signed-in user can
// read the collection; only the author can create, update, or delete their own entries
// (enforced by firestore.rules).

export async function publishPublicRecipe(recipe, user) {
  if (!db || !user) throw new Error('Log in to share recipes publicly.');
  const { portionOptions, ...rest } = recipe;
  const payload = clean({
    ...rest,
    ingredients: (rest.ingredients || []).map(({ portionOptions: _p, ...ing }) => ing),
    userId: user.uid,
    authorName: publicAuthorName(user),
    isPublic: true
  });
  await setDoc(doc(db, PUBLIC_RECIPES, recipe.id), { ...payload, publishedAt: serverTimestamp() });
}

export async function unpublishPublicRecipe(recipeId) {
  if (!db || !recipeId) return;
  await deleteDoc(doc(db, PUBLIC_RECIPES, recipeId));
}

/** Live feed of public recipes. Returns an unsubscribe function. */
export function subscribeToPublicRecipes(onChange, onError) {
  if (!db) return () => {};
  const q = query(collection(db, PUBLIC_RECIPES), orderBy('publishedAt', 'desc'), limit(PUBLIC_FEED_LIMIT));
  return onSnapshot(
    q,
    snap => onChange(snap.docs.map(d => ({ ...d.data(), id: d.id, publishedAt: undefined }))),
    err => onError?.(err)
  );
}
