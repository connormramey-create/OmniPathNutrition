import React, { useState } from 'react';
import { auth, googleProvider } from '../../config/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup } from 'firebase/auth';

export default function AuthModal({ isOpen, onClose, user }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!auth) { setError('Login is unavailable: Firebase is not configured (see .env.example).'); return; }
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!auth) { setError('Login is unavailable: Firebase is not configured (see .env.example).'); return; }
    try {
      await signInWithPopup(auth, googleProvider);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-[var(--card-bg)] text-[var(--text-main)] p-6 rounded-lg max-w-md w-full border border-gray-700">
        <h2 className="text-xl font-bold mb-4">{isSignUp ? 'Create Account' : 'Sign In'}</h2>
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            className="w-full p-2 rounded border bg-transparent"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full p-2 rounded border bg-transparent"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="w-full py-2 bg-[var(--accent)] text-white font-semibold rounded">
            {isSignUp ? 'Sign Up' : 'Log In'}
          </button>
        </form>
        <button onClick={handleGoogleSignIn} className="w-full mt-3 py-2 border border-gray-500 rounded font-semibold">
          Continue with Google
        </button>
        <div className="mt-4 text-center">
          <button onClick={() => setIsSignUp(!isSignUp)} className="text-sm underline">
            {isSignUp ? 'Already have an account? Log In' : "Don't have an account? Sign Up"}
          </button>
        </div>
        <button onClick={onClose} className="mt-4 w-full text-sm text-gray-400">Cancel</button>
      </div>
    </div>
  );
}
