/*
 * reminders.js — local notifications: a daily "write something" nudge and a
 * weekly "your debrief is ready" prompt.
 *
 * Scheduling a notification for a future time from a PWA is genuinely hard —
 * there's no reliable timer once the app is closed. We use two mechanisms and
 * hope at least one fires on a given device:
 *
 *   1. Notification Triggers (TimestampTrigger) — the browser fires it at the
 *      set time even with the app closed. Best case; not on every browser.
 *   2. Catch-up on open — when the app launches, fire anything that fell due
 *      while we were away and hasn't been handled.
 *
 * Snooze / skip actions on the notification are handled in sw.js, which writes
 * flags into the "meta" store that this module reads.
 */

import { getMeta, setMeta, getAllEntries } from './db.js';

const K = {
  enabled: 'diane.rem.enabled',
  dailyTime: 'diane.rem.dailyTime',   // "HH:MM" or "" (off)
  weeklyDay: 'diane.rem.weeklyDay',   // 0=Sun .. 6=Sat
  weeklyTime: 'diane.rem.weeklyTime', // "HH:MM"
};

export function getReminderSettings() {
  return {
    enabled: localStorage.getItem(K.enabled) === '1',
    dailyTime: localStorage.getItem(K.dailyTime) || '',
    weeklyDay: Number(localStorage.getItem(K.weeklyDay) ?? 0),
    weeklyTime: localStorage.getItem(K.weeklyTime) || '19:00',
  };
}
export function setReminderSettings(patch) {
  const next = { ...getReminderSettings(), ...patch };
  localStorage.setItem(K.enabled, next.enabled ? '1' : '0');
  localStorage.setItem(K.dailyTime, next.dailyTime || '');
  localStorage.setItem(K.weeklyDay, String(next.weeklyDay));
  localStorage.setItem(K.weeklyTime, next.weeklyTime || '19:00');
  return next;
}

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}
export function notificationPermission() {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}
/** Prompt for permission — call from a user click. */
export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Notification.permission;
}

// --- time maths -----------------------------------------------------
// Reminder de-dup keys are Monday-anchored regardless of the user's
// "first day of week" preference, so the app and the service worker
// (which can't read that preference) always agree on which 7-day period
// a "skip this week" / "already fired" flag belongs to.
function mondayKey(base = new Date()) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseHM(hm) {
  const [h, m] = String(hm || '0:0').split(':').map(Number);
  return { h: h || 0, m: m || 0 };
}
/** The daily slot on the given day. */
function dailySlot(hm, base = new Date()) {
  const { h, m } = parseHM(hm);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}
/** The weekly slot inside the Monday-week that contains `base`. */
function weeklySlot(day, hm, base = new Date()) {
  const monday = new Date(mondayKey(base) + 'T00:00:00');
  const { h, m } = parseHM(hm);
  const d = new Date(monday);
  d.setDate(d.getDate() + ((Number(day) + 6) % 7)); // Mon=0 … Sun=6
  d.setHours(h, m, 0, 0);
  return d;
}
function nextDaily(hm, from = new Date()) {
  const d = dailySlot(hm, from);
  if (d <= from) d.setDate(d.getDate() + 1);
  return d;
}
function nextWeekly(day, hm, from = new Date()) {
  let d = weeklySlot(day, hm, from);
  if (d <= from) d = weeklySlot(day, hm, new Date(from.getTime() + 7 * 86400000));
  return d;
}

const CAN_TRIGGER = typeof window !== 'undefined' && 'TimestampTrigger' in window;

const DAILY = {
  tag: 'diane-daily',
  title: 'Diane',
  body: 'Anything worth logging today?',
  actions: [{ action: 'snooze', title: 'Snooze 1h' }, { action: 'open', title: 'Open' }],
  data: { kind: 'daily' },
  icon: 'icons/icon.svg',
};
const WEEKLY = {
  tag: 'diane-weekly',
  title: 'Your weekly debrief is ready',
  body: 'A look back at your week is waiting.',
  actions: [{ action: 'snooze', title: 'Snooze 1h' }, { action: 'skip', title: 'Skip this week' }],
  data: { kind: 'weekly' },
  icon: 'icons/icon.svg',
};

async function swReg() {
  if (!('serviceWorker' in navigator)) return null;
  // navigator.serviceWorker.ready never resolves if registration failed — race
  // it against a timeout so reminders just no-op instead of hanging.
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((res) => setTimeout(() => res(null), 3000)),
    ]);
  } catch {
    return null;
  }
}
function show(reg, spec, extra = {}) {
  const { title, ...opts } = spec;
  return reg.showNotification(title, { ...opts, ...extra });
}

/** Schedule the next daily + weekly notification via the Triggers API. */
export async function scheduleReminders() {
  const s = getReminderSettings();
  const reg = await swReg();
  if (!reg) return;

  // Clear our previously-scheduled ones so we don't stack duplicates.
  for (const tag of ['diane-daily', 'diane-weekly']) {
    try {
      const existing = await reg.getNotifications({ tag, includeTriggered: true });
      existing.forEach((n) => n.close());
    } catch { /* includeTriggered unsupported — ignore */ }
  }

  // Stash the schedule where the service worker can read it (periodic sync).
  await setMeta('rem.schedule', {
    enabled: s.enabled,
    dailyTime: s.dailyTime,
    weeklyDay: s.weeklyDay,
    weeklyTime: s.weeklyTime,
  });

  if (!s.enabled || notificationPermission() !== 'granted') return;

  // Best-effort background wake-up (Chrome / installed PWA only). Loose timing.
  try {
    const status = await navigator.permissions?.query({ name: 'periodic-background-sync' });
    if (status?.state === 'granted' && 'periodicSync' in reg) {
      await reg.periodicSync.register('diane-reminders', { minInterval: 6 * 3600 * 1000 });
    }
  } catch { /* not supported — rely on triggers + catch-up */ }

  if (!CAN_TRIGGER) return;

  if (s.dailyTime) {
    await show(reg, DAILY, { showTrigger: new TimestampTrigger(nextDaily(s.dailyTime).getTime()) });
  }
  await show(reg, WEEKLY, {
    showTrigger: new TimestampTrigger(nextWeekly(s.weeklyDay, s.weeklyTime).getTime()),
  });
}

/** Fire a notification right now — a "does this device show notifications at all" check. */
export async function sendTestNotification() {
  if (notificationPermission() !== 'granted') {
    const p = await requestNotificationPermission();
    if (p !== 'granted') throw new Error('Notification permission not granted.');
  }
  const reg = await swReg();
  if (reg) {
    await reg.showNotification('Diane', {
      body: 'Test notification — if you can see this, notifications work on this device.',
      tag: 'diane-test',
      icon: 'icons/icon.svg',
    });
  } else if ('Notification' in window) {
    new Notification('Diane', { body: 'Test notification (no service worker).' });
  } else {
    throw new Error('Notifications unavailable.');
  }
}

/**
 * Which reminders are due right now and not yet handled.
 * Used to show an *in-app* prompt when the app is open — a system
 * notification from a service worker is dropped or silenced by the browser
 * while its own page is focused (and Brave doesn't render notification
 * action buttons at all), so the reliable path when you're in the app is a
 * banner, not a notification. The service worker still fires real
 * notifications for the closed-app case (sw.js → fireDueReminders).
 * @returns {Promise<Array<{kind:'daily'|'weekly'}>>}
 */
export async function getDueReminders() {
  const s = getReminderSettings();
  if (!s.enabled) return [];
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const week = mondayKey(now);
  const due = [];

  if (s.dailyTime) {
    const slot = dailySlot(s.dailyTime, now);
    const snooze = await getMeta('rem.dailySnoozeUntil');
    const wrote = (await getAllEntries()).some((e) => e.createdAt.slice(0, 10) === today);
    if (now >= slot && (await getMeta('rem.lastDaily')) !== today && !wrote
        && (!snooze || now >= new Date(snooze))) {
      due.push({ kind: 'daily' });
    }
  }

  const wslot = weeklySlot(s.weeklyDay, s.weeklyTime, now);
  const wsnooze = await getMeta('rem.weeklySnoozeUntil');
  if (now >= wslot && (await getMeta('rem.lastWeekly')) !== week
      && (await getMeta('rem.weeklySkip')) !== week
      && (!wsnooze || now >= new Date(wsnooze))) {
    due.push({ kind: 'weekly' });
  }
  return due;
}

export async function snoozeReminder(kind, hours = 1) {
  await setMeta(`rem.${kind}SnoozeUntil`, new Date(Date.now() + hours * 3600000).toISOString());
}
/** Snooze until a specific clock time today (or tomorrow if already past). */
export async function snoozeReminderUntil(kind, hhmm) {
  const { h, m } = parseHM(hhmm);
  const t = new Date();
  t.setHours(h, m, 0, 0);
  if (t <= new Date()) t.setDate(t.getDate() + 1);
  await setMeta(`rem.${kind}SnoozeUntil`, t.toISOString());
}
export async function dismissReminder(kind) {
  if (kind === 'daily') await setMeta('rem.lastDaily', new Date().toISOString().slice(0, 10));
  else await setMeta('rem.lastWeekly', mondayKey());
}
export async function skipWeeklyThisWeek() {
  await setMeta('rem.weeklySkip', mondayKey());
}

/** Run once at startup — sets up the background (closed-app) notification path. */
export async function initReminders() {
  if (!notificationsSupported()) return;
  await scheduleReminders();
}

/** A plain-text readout of every gate the daily/weekly check goes through. */
export async function explainReminders() {
  const s = getReminderSettings();
  const reg = await swReg();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const lines = [
    `enabled (saved): ${s.enabled}`,
    `permission: ${notificationPermission()}`,
    `service worker ready: ${!!reg}`,
    `Notification Triggers: ${CAN_TRIGGER}`,
    `now: ${now.toLocaleString()}`,
  ];

  if (s.dailyTime) {
    const due = dailySlot(s.dailyTime, now);
    const last = await getMeta('rem.lastDaily');
    const wrote = (await getAllEntries()).some((e) => e.createdAt.slice(0, 10) === today);
    const snooze = await getMeta('rem.dailySnoozeUntil');
    const wouldFire = s.enabled && notificationPermission() === 'granted' && !!reg
      && now >= due && last !== today && !wrote && (!snooze || now >= new Date(snooze));
    lines.push(
      '',
      `DAILY  set for ${s.dailyTime}`,
      `  time passed today: ${now >= due}`,
      `  already fired today: ${last === today}`,
      `  wrote an entry today: ${wrote}`,
      `  snoozed: ${snooze ? `until ${new Date(snooze).toLocaleString()}` : 'no'}`,
      `  → would fire on next check: ${wouldFire}`,
    );
  } else {
    lines.push('', 'DAILY  not set');
  }

  const wdue = weeklySlot(s.weeklyDay, s.weeklyTime, now);
  const wlast = await getMeta('rem.lastWeekly');
  const wskip = await getMeta('rem.weeklySkip');
  const week = mondayKey(now);
  lines.push(
    '',
    `WEEKLY  ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][s.weeklyDay]} ${s.weeklyTime}`,
    `  slot this week: ${wdue.toLocaleString()}`,
    `  time passed: ${now >= wdue}`,
    `  already fired this week: ${wlast === week}`,
    `  skipped this week: ${wskip === week}`,
    `  → would fire on next check: ${s.enabled && notificationPermission() === 'granted' && !!reg && now >= wdue && wlast !== week && wskip !== week}`,
  );
  return lines.join('\n');
}

/** Force-show a reminder now, bypassing every gate — for testing content/actions. */
export async function fireReminderNow(kind = 'daily') {
  const reg = await swReg();
  const spec = kind === 'weekly' ? WEEKLY : DAILY;
  if (reg) await show(reg, spec);
  else if ('Notification' in window) new Notification(spec.title, { body: spec.body });
  else throw new Error('Notifications unavailable.');
}
