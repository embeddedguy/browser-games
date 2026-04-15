/**
 * auth.js — Authentication helpers.
 *
 * Wraps Firebase Auth. Falls back to a no-op when Firebase is not configured.
 */

import { signInWithEmailAndPassword, createUserWithEmailAndPassword,
         signOut, onAuthStateChanged }                        from 'firebase/auth';
import { getFirebaseAuth, isFirebaseReady }                   from './firebase.js';

/**
 * Sign in with email and password.
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export async function signIn(email, password) {
  if (!isFirebaseReady()) throw new Error('Firebase is not configured yet.');
  return signInWithEmailAndPassword(getFirebaseAuth(), email, password);
}

/**
 * Register a new user account.
 * @returns {Promise<import('firebase/auth').UserCredential>}
 */
export async function register(email, password) {
  if (!isFirebaseReady()) throw new Error('Firebase is not configured yet.');
  return createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
}

/**
 * Sign the current user out.
 */
export async function logout() {
  if (!isFirebaseReady()) return;
  return signOut(getFirebaseAuth());
}

/**
 * Listen for auth state changes.
 * Calls callback immediately with the current user (or null).
 *
 * @param {(user: Object|null) => void} callback
 * @returns {() => void}  Unsubscribe function
 */
export function onAuthChange(callback) {
  if (!isFirebaseReady()) {
    // No Firebase — immediately call with null so app can show login screen
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(getFirebaseAuth(), callback);
}
