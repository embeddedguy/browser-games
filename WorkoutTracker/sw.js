/**
 * sw.js — Service Worker (Workbox-free, minimal cache-first for v1).
 *
 * Strategy:
 *   - App shell (HTML, CSS, JS) → cache-first; update in background
 *   - Firebase / CDN assets    → stale-while-revalidate
 *   - Workout data             → handled by Dexie (IndexedDB) + Firestore offline SDK
 *
 * For v2, swap this out for a full Workbox config.
 */

const CACHE_NAME = 'workout-tracker-v2';

const APP_SHELL = [
  '/',
  '/index.html',
  '/src/css/main.css',
  '/src/js/app.js',
  '/src/js/db.js',
  '/src/js/progression.js',
  '/src/js/session.js',
  '/src/js/firebase.js',
  '/src/js/auth.js',
  '/src/js/sync.js',
  '/firebase.config.js',
  '/src/js/ui/utils.js',
  '/src/js/ui/login.js',
  '/src/js/ui/onboarding.js',
  '/src/js/ui/dashboard.js',
  '/src/js/ui/active-session.js',
  '/src/js/ui/session-complete.js',
  '/src/js/ui/history.js',
  '/src/js/ui/progress.js',
  '/src/js/ui/admin/dashboard.js',
  '/src/js/ui/admin/program-builder.js',
  '/src/js/ui/admin/trainee-manager.js',
];

// ── Install: cache app shell ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ── Activate: remove old caches ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: cache-first for app shell, network-first for everything else ───────
self.addEventListener('fetch', event => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip Firebase / external requests — Firestore SDK handles those
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then(cached => {
      const networkFetch = fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      });

      // Return cached immediately, update in background
      return cached ?? networkFetch;
    })
  );
});
