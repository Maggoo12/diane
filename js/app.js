/*
 * app.js — entry point. Wires the pieces together, switches between the two
 * views, and registers the service worker so Diane installs and runs offline.
 *
 * Module map:
 *   db.js         local-first storage (IndexedDB): entries, audio, goals
 *   transcribe.js swappable audio-blob -> text seam (Groq Whisper)
 *   capture.js    press-and-hold / tap voice + text capture
 *   timeline.js   grouped, searchable list of entries
 *   goals.js      the week's goals
 *   debrief.js    swappable "writer" seam — week of entries -> summary text
 *   speak.js      swappable "narrator" seam — text -> spoken audio
 *   week.js       the Week view: goals + debrief + settings
 *   seed.js       synthetic sample data (dev)
 *
 * Still to build (see docs/roadmap.md, Phase 1):
 *   - daily reminder notification
 *   - offline transcription queue + retry
 */

import { initCapture } from './capture.js';
import { renderTimeline } from './timeline.js';
import { initWeek, refreshWeek } from './week.js';

function setView(name) {
  document.getElementById('view-journal').hidden = name !== 'journal';
  document.getElementById('view-week').hidden = name !== 'week';
  document.getElementById('nav-journal').classList.toggle('is-active', name === 'journal');
  document.getElementById('nav-week').classList.toggle('is-active', name === 'week');
  if (name === 'week') refreshWeek();
}

async function main() {
  initCapture(renderTimeline);
  await renderTimeline();
  initWeek(() => renderTimeline());

  document.getElementById('nav-journal').addEventListener('click', () => setView('journal'));
  document.getElementById('nav-week').addEventListener('click', () => setView('week'));
  setView('journal');

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('sw.js');
    } catch (err) {
      console.warn('[app] service worker registration failed:', err);
    }
  }
}

main();
