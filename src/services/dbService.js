import { db } from '../config/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

export async function saveUserProfile(userId, profileData) {
  const profileRef = doc(db, 'users', userId, 'profile', 'settings');
  await setDoc(profileRef, { ...profileData, updatedAt: new Date() }, { merge: true });
}

export async function getUserProfile(userId) {
  const profileRef = doc(db, 'users', userId, 'profile', 'settings');
  const snap = await getDoc(profileRef);
  return snap.exists() ? snap.data() : null;
}
