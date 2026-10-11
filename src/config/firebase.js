import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBglCYd7scuCFc71RyvCrl5x7KwjPBeHdQ",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "omnipathnutrition.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "omnipathnutrition",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "omnipathnutrition.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "546534442121",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:546534442121:web:ad3f192082ac7e38587258"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
