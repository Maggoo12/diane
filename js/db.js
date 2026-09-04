/*
 * db.js — local-first storage for Diane.
 *
 * Everything lives on-device in IndexedDB. No server in v1.
 *   - "entries" : one record per journal entry (text + metadata)
 *   - "audio"   : raw voice recordings, keyed by id, kept separate so the
 *                 timeline can load fast without pulling big blobs
 *   - "goals"   : the goals the user sets for a given week
 *   - "meta"    : small key/value bits both the app and the service worker
 *                 need to read (reminder schedule, snooze/skip flags)
 *
 * Every function returns a Promise so callers can `await` them.
 */

const DB_NAME = 'diane';
const DB_VERSION = 3; // v2 added "goals", v3 added "meta"

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    // Runs only when the DB is first created or DB_VERSION goes up.
    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('entries')) {
        const entries = db.createObjectStore('entries', { keyPath: 'id' });
        // Sort/scan the timeline by time without loading everything.
        entries.createIndex('createdAt', 'createdAt');
      }

      if (!db.objectStoreNames.contains('audio')) {
        db.createObjectStore('audio', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('goals')) {
        const goals = db.createObjectStore('goals', { keyPath: 'id' });
        // Goals are grouped by the week they belong to (Monday's date string).
        goals.createIndex('weekOf', 'weekOf');
      }

      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'k' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

// Wrap a single IDBRequest (get/getAll/put/...) in a Promise.
function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Wrap a whole IDBTransaction in a Promise. A transaction does NOT fire
// 'onsuccess' — it fires 'oncomplete' once its writes are committed. Awaiting
// the wrong event here means the await never resolves and every line after it
// is silently skipped.
function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function makeId() {
  // Time-prefixed so ids also sort chronologically. crypto is available in PWAs.
  return `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Save a new entry.
 * @param {{ text: string, source: 'voice'|'text', audioBlob?: Blob }} input
 * @returns {Promise<object>} the stored entry record
 */
export async function addEntry({ text, source, audioBlob }) {
  const db = await openDB();
  const id = makeId();
  const now = new Date();

  const entry = {
    id,
    text: (text || '').trim(),
    source,
    createdAt: now.toISOString(),
    // 'done' once we have a transcript; 'pending' when audio is saved but not
    // yet transcribed (offline). The debrief only reads 'done' entries.
    transcriptStatus: source === 'voice' && !text ? 'pending' : 'done',
    audioId: audioBlob ? id : null,
  };

  const tx = db.transaction(['entries', 'audio'], 'readwrite');
  tx.objectStore('entries').put(entry);
  if (audioBlob) {
    tx.objectStore('audio').put({ id, blob: audioBlob });
  }
  await txDone(tx);
  return entry;
}

/**
 * Insert an entry with an explicit timestamp. Only used by the sample-data
 * seeder (js/seed.js) — normal captures go through addEntry.
 */
export async function importEntry({ text, source = 'text', createdAt }) {
  const db = await openDB();
  const entry = {
    id: makeId(),
    text: (text || '').trim(),
    source,
    createdAt,
    transcriptStatus: 'done',
    audioId: null,
  };
  const tx = db.transaction('entries', 'readwrite');
  tx.objectStore('entries').put(entry);
  await txDone(tx);
  return entry;
}

/** Edit an entry's text directly, from the timeline (voice or text entry). */
export async function updateEntryText(id, text) {
  return setEntryTranscript(id, text); // same effect: set the text, mark it done
}

/**
 * Fill in (or replace) an entry's transcript and mark it done.
 * Used after a voice entry's audio comes back from the transcription API.
 */
export async function setEntryTranscript(id, text) {
  const db = await openDB();
  const tx = db.transaction('entries', 'readwrite');
  const store = tx.objectStore('entries');
  const entry = await promisify(store.get(id));
  if (entry) {
    entry.text = (text || '').trim();
    entry.transcriptStatus = 'done';
    store.put(entry);
  }
  await txDone(tx);
}

/** All entries, newest first. */
export async function getAllEntries() {
  const db = await openDB();
  const tx = db.transaction('entries', 'readonly');
  const all = await promisify(tx.objectStore('entries').getAll());
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Case-insensitive substring search over entry text, newest first. */
export async function searchEntries(query) {
  const q = query.trim().toLowerCase();
  const all = await getAllEntries();
  if (!q) return all;
  return all.filter((e) => e.text.toLowerCase().includes(q));
}

/** Fetch one audio blob for playback. Returns a Blob or null. */
export async function getAudio(audioId) {
  if (!audioId) return null;
  const db = await openDB();
  const tx = db.transaction('audio', 'readonly');
  const rec = await promisify(tx.objectStore('audio').get(audioId));
  return rec ? rec.blob : null;
}

/** Delete one entry and its audio recording, if it had one. */
export async function deleteEntry(id) {
  const db = await openDB();
  const tx = db.transaction(['entries', 'audio'], 'readwrite');
  tx.objectStore('entries').delete(id);
  tx.objectStore('audio').delete(id); // no-op if there was no audio
  await txDone(tx);
}

/**
 * Entries with createdAt in [startISO, endISO), newest first.
 * Used by the debrief to pull just one week of the journal.
 */
export async function getEntriesInRange(startISO, endISO) {
  const all = await getAllEntries();
  return all.filter((e) => e.createdAt >= startISO && e.createdAt < endISO);
}

// --- goals ---------------------------------------------------------------

/** First day of the week: 0=Sun, 1=Mon (default), 6=Sat. Regional preference. */
export function getWeekStart() {
  const raw = localStorage.getItem('diane.weekStart');
  if (raw === null) return 1; // Number(null) is 0 — guard before coercing
  const v = Number(raw);
  return v === 0 || v === 6 ? v : 1;
}
export function setWeekStart(v) {
  localStorage.setItem('diane.weekStart', String(Number(v)));
}

function ymdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * The first day of the week containing `date`, as a "YYYY-MM-DD" string.
 * Honours the user's "first day of week" preference. Goals and the weekly
 * debrief are keyed on this so everything lines up.
 */
export function weekOf(date = new Date()) {
  const start = getWeekStart();
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const back = (d.getDay() - start + 7) % 7;
  d.setDate(d.getDate() - back);
  return ymdLocal(d);
}

/** Add a goal to a given week (defaults to the current week). */
export async function addGoal({
  text,
  week = weekOf(),
  done = false,
  createdAt = new Date().toISOString(),
}) {
  const db = await openDB();
  const goal = {
    id: makeId(),
    text: (text || '').trim(),
    weekOf: week,
    done,
    createdAt,
  };
  const tx = db.transaction('goals', 'readwrite');
  tx.objectStore('goals').put(goal);
  await txDone(tx);
  return goal;
}

/** Goals for one week, oldest first. */
export async function getGoals(week = weekOf()) {
  const db = await openDB();
  const tx = db.transaction('goals', 'readonly');
  const all = await promisify(tx.objectStore('goals').index('weekOf').getAll(week));
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Flip a goal's done flag. */
export async function toggleGoal(id) {
  const db = await openDB();
  const tx = db.transaction('goals', 'readwrite');
  const store = tx.objectStore('goals');
  const goal = await promisify(store.get(id));
  if (goal) {
    goal.done = !goal.done;
    store.put(goal);
  }
  await txDone(tx);
}

export async function deleteGoal(id) {
  const db = await openDB();
  const tx = db.transaction('goals', 'readwrite');
  tx.objectStore('goals').delete(id);
  await txDone(tx);
}

/** Every goal across every week — for backup export. */
export async function getAllGoals() {
  const db = await openDB();
  const tx = db.transaction('goals', 'readonly');
  return promisify(tx.objectStore('goals').getAll());
}

// --- audio (bulk, for backup) -----------------------------------------
export async function getAllAudio() {
  const db = await openDB();
  const tx = db.transaction('audio', 'readonly');
  return promisify(tx.objectStore('audio').getAll()); // [{ id, blob }]
}

// --- meta (key/value the SW can also read) --------------------------
export async function getMeta(k) {
  const db = await openDB();
  const tx = db.transaction('meta', 'readonly');
  const rec = await promisify(tx.objectStore('meta').get(k));
  return rec ? rec.v : undefined;
}
export async function setMeta(k, v) {
  const db = await openDB();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ k, v });
  await txDone(tx);
}
export async function deleteMeta(k) {
  const db = await openDB();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').delete(k);
  await txDone(tx);
}

// --- backup restore -----------------------------------------------
/**
 * Write a backup's contents back into the DB.
 * @param {{entries?: object[], goals?: object[], audio?: {id, blob}[]}} data
 * @param {{replace?: boolean, onProgress?: (done:number,total:number)=>void}} opts
 */
export async function restoreAll({ entries = [], goals = [], audio = [] }, { replace = true, onProgress } = {}) {
  const db = await openDB();

  if (replace) {
    const c = db.transaction(['entries', 'audio', 'goals'], 'readwrite');
    c.objectStore('entries').clear();
    c.objectStore('audio').clear();
    c.objectStore('goals').clear();
    await txDone(c);
  }

  const total = entries.length + goals.length + audio.length;
  let done = 0;
  const bump = () => onProgress?.(++done, total);

  const tx = db.transaction(['entries', 'audio', 'goals'], 'readwrite');
  for (const e of entries) { tx.objectStore('entries').put(e); bump(); }
  for (const g of goals) { tx.objectStore('goals').put(g); bump(); }
  for (const a of audio) { tx.objectStore('audio').put(a); bump(); }
  await txDone(tx);

  return { entries: entries.length, goals: goals.length, audio: audio.length };
}

/** Wipe all journal content — backs the "delete all" privacy control.
 *  Leaves "meta" (reminder schedule/flags) alone; those are config, not data. */
export async function clearAll() {
  const db = await openDB();
  const tx = db.transaction(['entries', 'audio', 'goals'], 'readwrite');
  tx.objectStore('entries').clear();
  tx.objectStore('audio').clear();
  tx.objectStore('goals').clear();
  await txDone(tx);
}
