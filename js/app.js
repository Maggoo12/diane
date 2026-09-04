/*
 * app.js — entry point. Wires the pieces together, switches between the two
 * views, and registers the service worker so Diane installs and runs offline.
 *
 * Module map:
 *   db.js         local-first storage (IndexedDB): entries, audio, goals, meta
 *   transcribe.js swappable audio-blob -> text seam (Groq Whisper)
 *   capture.js    press-and-hold / tap voice + text capture
 *   timeline.js   grouped, searchable list of entries
 *   goals.js      the week's goals
 *   debrief.js    swappable "writer" seam — week of entries -> summary text
 *   speak.js      swappable "narrator" seam — text -> spoken audio
 *   week.js       the Week view: goals + debrief + settings + backup + reminders
 *   backup.js     export / import the whole journal to one file
 *   reminders.js  reminder schedule + "is one due" logic
 *   reminderbar.js in-app due-reminder bar (postpone / skip)
 *   seed.js       synthetic sample data (dev)
 *
 * Still to build (see docs/roadmap.md, Phase 1):
 *   - offline transcription queue + auto-retry
 *   - serverless proxy for the API keys (before other users)
 */

import { initCapture } from './capture.js';
import { renderTimeline } from './timeline.js';
import { initWeek, refreshWeek, settingsDirty, revertSettings } from './week.js';
import { initReminders } from './reminders.js';
import { initReminderBar } from './reminderbar.js';

function setView(name) {
  document.getElementById('view-journal').hidden = name !== 'journal';
  document.getElementById('view-week').hidden = name !== 'week';
  document.getElementById('nav-journal').classList.toggle('is-active', name === 'journal');
  document.getElementById('nav-week').classList.toggle('is-active', name === 'week');
  if (name === 'week') refreshWeek();
}

function initSettingsToggle() {
  const panel = document.getElementById('settings-panel');
  const backdrop = document.getElementById('settings-backdrop');
  const open = () => { panel.hidden = false; backdrop.hidden = false; };
  const close = () => {
    if (settingsDirty()) {
      if (!confirm('Discard unsaved settings changes?')) return;
      revertSettings();
    }
    panel.hidden = true;
    backdrop.hidden = true;
  };

  document.getElementById('settings-open').addEventListener('click', open);
  document.getElementById('settings-close').addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) close();
  });
}

async function main() {
  initCapture(renderTimeline);
  await renderTimeline();
  initWeek(() => renderTimeline());
  initSettingsToggle();

  document.getElementById('nav-journal').addEventListener('click', () => setView('journal'));
  document.getElementById('nav-week').addEventListener('click', () => setView('week'));

  // A weekly-reminder notification opens straight to the Week view.
  const startView = location.hash === '#week' ? 'week' : 'journal';
  setView(startView);

  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type === 'reminder-open') setView(e.data.kind === 'weekly' ? 'week' : 'journal');
  });

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('sw.js');
    } catch (err) {
      console.warn('[app] service worker registration failed:', err);
    }
  }

  initReminders(); // background (closed-app) notification schedule
  initReminderBar({ openWeek: () => setView('week') }); // in-app due-reminder prompt
}

main();
