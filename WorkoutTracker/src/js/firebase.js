/**
 * firebase.js — Firebase initialisation.
 *
 * Initialises the app once, enables Firestore offline persistence,
 * and exports getters for auth and db. Gracefully degrades to
 * offline-only mode if Firebase config is not yet set up.
 */

import { initializeApp }                                      from 'firebase/app';
import { initializeFirestore, persistentLocalCache,
         persistentMultipleTabManager }                       from 'firebase/firestore';
import { getAuth }                                            from 'firebase/auth';
import { firebaseConfig }                                     from '../../firebase.config.js';

let _app   = null;
let _store = null;
let _auth  = null;
let _ready = false;

export async function initFirebase() {
  if (firebaseConfig.apiKey === 'YOUR_API_KEY') {
    console.warn('[Firebase] Config not set — running in offline-only mode.');
    return;
  }

  try {
    _app = initializeApp(firebaseConfig);

    // Use persistent cache so Firestore works offline out of the box.
    // Multi-tab manager keeps tabs in sync when multiple browser tabs are open.
    _store = initializeFirestore(_app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });

    _auth  = getAuth(_app);
    _ready = true;
  } catch (err) {
    console.error('[Firebase] Init failed — running in offline-only mode:', err.message);
  }
}

export function getFirestore() { return _store; }
export function getFirebaseAuth() { return _auth; }
export function isFirebaseReady() { return _ready; }
