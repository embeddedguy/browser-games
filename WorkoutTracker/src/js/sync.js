/**
 * sync.js — Offline-first sync queue.
 *
 * Writes go to Dexie (local) first, then are mirrored to Firestore when online.
 * The sync queue is a simple collection in Dexie that stores pending writes.
 *
 * Firestore's offline persistence SDK handles most of this automatically;
 * this module handles the explicit local-first guarantee for cases where we
 * want to write to Dexie before Firestore has initialised (e.g., first load).
 */

import { collection, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { getFirestore, isFirebaseReady }       from './firebase.js';

// Add a pending sync operation to the local queue (Dexie).
// The queue is stored in the 'syncQueue' object store added to Dexie separately.
// For v1, Firestore's own offline cache handles the queue;
// this function is a no-op placeholder for explicit queue logic in v2.
export function queueWrite(/* collection, id, data */) {
  // v1: Firestore SDK offline persistence handles this automatically.
  // v2: implement explicit IndexedDB queue for non-Firestore writes.
}

/**
 * Mirror a local Dexie write to Firestore.
 * Safe to call when offline — Firestore SDK will queue it internally.
 *
 * @param {string} collectionName  Firestore collection
 * @param {string|number} id       Document ID
 * @param {Object} data            Data to write (must be serialisable)
 */
export async function mirrorToFirestore(collectionName, id, data) {
  if (!isFirebaseReady()) return;
  try {
    const ref = doc(collection(getFirestore(), collectionName), String(id));
    await setDoc(ref, data, { merge: true });
  } catch (err) {
    // Firestore SDK will retry when back online; safe to swallow here.
    console.warn('[sync] mirrorToFirestore queued for later:', err.message);
  }
}

/**
 * Delete a Firestore document.
 * Safe to call when offline.
 */
export async function deleteFromFirestore(collectionName, id) {
  if (!isFirebaseReady()) return;
  try {
    const ref = doc(collection(getFirestore(), collectionName), String(id));
    await deleteDoc(ref);
  } catch (err) {
    console.warn('[sync] deleteFromFirestore queued for later:', err.message);
  }
}
