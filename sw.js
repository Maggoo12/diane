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

const CACHE_VERSION = 'diane-v6';
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
