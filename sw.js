/*
 * sw.js — service worker. Makes Diane installable and usable offline.
 *
 * Strategy: NETWORK-FIRST for same-origin GETs. Always try the live file; fall
 * back to the cache only when the network fails (offline). Every successful
 * response is copied into the cache so the fallback stays fresh.
 *
 * Why not cache-first: during development, cache-first serves stale JS forever
 * and you can't tell your fixes aren't loading. Network-first means "edit file,
 * refresh, see change" while still working fully offline.
 *
 * Entry data is NOT here — that lives in IndexedDB (see js/db.js).
 */

const CACHE_VERSION = 'diane-v8';
const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/capture.js',
  './js/timeline.js',
  './js/db.js',
  './js/transcribe.js',
  './js/goals.js',
  './js/week.js',
  './js/debrief.js',
  './js/speak.js',
  './js/seed.js',
  './js/backup.js',
  './js/reminders.js',
  './manifest.webmanifest',
  './icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Stash a fresh copy for offline use, then return the live one.
        const copy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match('./index.html'))
      )
  );
});

// --- reminder notifications ---------------------------------------------
// Snooze/skip write flags into the "meta" store that js/reminders.js reads.
// Keep this version in sync with DB_VERSION in js/db.js.
const DB_VERSION = 3;

function metaSet(k, v) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('diane', DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) { db.close(); return resolve(); }
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({ k, v });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}

function mondayOf(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

self.addEventListener('notificationclick', (event) => {
  const kind = event.notification.data?.kind || 'daily';
  const action = event.action;
  event.notification.close();

  if (action === 'snooze') {
    const until = new Date(Date.now() + 3600 * 1000).toISOString();
    event.waitUntil(metaSet(`rem.${kind}SnoozeUntil`, until));
    return;
  }
  if (action === 'skip' && kind === 'weekly') {
    event.waitUntil(metaSet('rem.weeklySkip', mondayOf()));
    return;
  }

  // Body tap or "open": focus an existing window, else open one.
  const target = kind === 'weekly' ? './#week' : './';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) {
      if ('focus' in c) {
        c.postMessage({ type: 'reminder-open', kind });
        return c.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
