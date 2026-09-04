/*
 * reminderbar.js — the in-app reminder prompt.
 *
 * When the app opens (or is brought back to the foreground) and a reminder
 * is due, this shows a bar with the postpone/skip actions right there. It's
 * the reliable path: a service-worker notification is dropped by the browser
 * while its own page is focused, and Brave doesn't render notification action
 * buttons at all.
 */

import {
  getDueReminders,
  snoozeReminder, snoozeReminderUntil,
  dismissReminder, skipWeeklyThisWeek,
} from './reminders.js';

let barEl = null;
let onOpenWeek = () => {};

export function initReminderBar({ openWeek } = {}) {
  barEl = document.getElementById('reminder-bar');
  onOpenWeek = openWeek || (() => {});
  render();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') render();
  });
}

export async function render() {
  if (!barEl) return;
  const due = await getDueReminders();
  barEl.innerHTML = '';
  barEl.hidden = due.length === 0;
  for (const r of due) {
    barEl.appendChild(r.kind === 'weekly' ? weeklyBar() : dailyBar());
  }
}

/** Force both rows on screen regardless of due state — for testing the bar. */
export function previewBar() {
  if (!barEl) return;
  barEl.innerHTML = '';
  barEl.hidden = false;
  barEl.append(dailyBar(), weeklyBar());
}

function btn(label, handler, cls = 'reminder-bar__btn') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  b.addEventListener('click', async (e) => {
    e.stopPropagation();
    await handler();
    render();
  });
  return b;
}

function dailyBar() {
  const row = document.createElement('div');
  row.className = 'reminder-bar__row';
  const text = document.createElement('span');
  text.className = 'reminder-bar__text';
  text.textContent = '✍️ Nothing logged today yet';
  const actions = document.createElement('div');
  actions.className = 'reminder-bar__actions';
  actions.append(
    btn('Snooze 1h', () => snoozeReminder('daily', 1)),
    btn('Dismiss', () => dismissReminder('daily')),
  );
  row.append(text, actions);
  return row;
}

function weeklyBar() {
  const row = document.createElement('div');
  row.className = 'reminder-bar__row';

  const text = document.createElement('button');
  text.type = 'button';
  text.className = 'reminder-bar__text reminder-bar__text--link';
  text.textContent = '🗓️ Your weekly debrief is ready';
  text.addEventListener('click', async () => {
    await dismissReminder('weekly');
    onOpenWeek();
    render();
  });

  const actions = document.createElement('div');
  actions.className = 'reminder-bar__actions';
  actions.append(
    btn('1h', () => snoozeReminder('weekly', 1)),
    btn('2h', () => snoozeReminder('weekly', 2)),
    btn('Tonight', () => snoozeReminderUntil('weekly', '19:00')),
    btn('Skip this week', () => skipWeeklyThisWeek()),
  );

  row.append(text, actions);
  return row;
}
