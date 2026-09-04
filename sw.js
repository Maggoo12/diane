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

const CACHE_VERSION = 'diane-v11';
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

function withMeta(mode, fn) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('diane', DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) { db.close(); return resolve(undefined); }
      const tx = db.transaction('meta', mode);
      const out = fn(tx.objectStore('meta'));
      tx.oncomplete = () => { db.close(); resolve(out && out.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}
const metaSet = (k, v) => withMeta('readwrite', (s) => s.put({ k, v }));
const metaGet = (k) => withMeta('readonly', (s) => s.get(k)).then((rec) => (rec ? rec.v : undefined));

function wroteOn(ymd) {
  return new Promise((resolve) => {
    const req = indexedDB.open('diane', DB_VERSION);
    req.onerror = () => resolve(false);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('entries')) { db.close(); return resolve(false); }
      const all = db.transaction('entries', 'readonly').objectStore('entries').getAll();
      all.onsuccess = () => {
        db.close();
        resolve((all.result || []).some((e) => (e.createdAt || '').slice(0, 10) === ymd));
      };
      all.onerror = () => { db.close(); resolve(false); };
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

// Background wake-up (Chrome / installed PWA, loose timing). Checks the
// schedule the app stashed in "meta" and fires anything now due.
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'diane-reminders') return;
  event.waitUntil(fireDueReminders());
});
// Also runnable on demand from the page (postMessage {type:'check-reminders'}).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'check-reminders') event.waitUntil(fireDueReminders());
});

async function fireDueReminders() {
  const s = await metaGet('rem.schedule');
  if (!s || !s.enabled) return;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const week = mondayOf(now);
  const { h: dh, m: dm } = splitHM(s.dailyTime);
  const { h: wh, m: wm } = splitHM(s.weeklyTime);

  // daily
  if (s.dailyTime) {
    const due = new Date(now); due.setHours(dh, dm, 0, 0);
    const snooze = await metaGet('rem.dailySnoozeUntil');
    if (
      now >= due &&
      (await metaGet('rem.lastDaily')) !== today &&
      (!snooze || now >= new Date(snooze)) &&
      !(await wroteOn(today))
    ) {
      await safeShow('Diane', {
        tag: 'diane-daily', body: 'Anything worth logging today?', data: { kind: 'daily' },
        actions: [{ action: 'snooze', title: 'Snooze 1h' }, { action: 'open', title: 'Open' }],
        icon: 'icons/icon.svg',
      });
      await metaSet('rem.lastDaily', today);
    }
  }

  // weekly
  {
    const monday = new Date(week + 'T00:00:00');
    const due = new Date(monday);
    due.setDate(due.getDate() + ((Number(s.weeklyDay) + 6) % 7));
    due.setHours(wh, wm, 0, 0);
    const snooze = await metaGet('rem.weeklySnoozeUntil');
    if (
      now >= due &&
      (await metaGet('rem.lastWeekly')) !== week &&
      (await metaGet('rem.weeklySkip')) !== week &&
      (!snooze || now >= new Date(snooze))
    ) {
      await safeShow('Your weekly debrief is ready', {
        tag: 'diane-weekly', body: 'A look back at your week is waiting.', data: { kind: 'weekly' },
        actions: [{ action: 'snooze', title: 'Snooze 1h' }, { action: 'skip', title: 'Skip this week' }],
        icon: 'icons/icon.svg',
      });
      await metaSet('rem.lastWeekly', week);
    }
  }
}

function splitHM(hm) {
  const [h, m] = String(hm || '0:0').split(':').map(Number);
  return { h: h || 0, m: m || 0 };
}
async function safeShow(title, opts) {
  try { await self.registration.showNotification(title, opts); } catch (e) { /* not granted */ }
}
