import { db } from '../config/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

export async function saveUserData(userId, userData) {
  if (!userId) return;
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, {
    ...userData,
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

export async function getUserData(userId) {
  if (!userId) return null;
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  return snap.exists() ? snap.data() : null;
}
