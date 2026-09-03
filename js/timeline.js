/*
 * timeline.js — the reverse-chronological view of entries, grouped by day.
 * Also owns the search box (plain substring match, see db.searchEntries).
 */

import { searchEntries, getAudio, deleteEntry } from './db.js';

const entriesEl = document.getElementById('entries');
const emptyEl = document.getElementById('empty-state');
const searchEl = document.getElementById('search');

// Format helpers -----------------------------------------------------------
const dayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long', month: 'long', day: 'numeric',
});
const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric', minute: '2-digit',
});

function dayKey(iso) {
  return iso.slice(0, 10); // YYYY-MM-DD — groups entries by calendar day
}

// Render -----------------------------------------------------------------
export async function renderTimeline() {
  const query = searchEl.value;
  const entries = await searchEntries(query);

  entriesEl.innerHTML = '';
  if (entries.length === 0) {
    emptyEl.hidden = false;
    emptyEl.textContent = query.trim()
      ? 'No matches.'
      : 'No entries yet. Hold or tap the button and say something.';
  } else {
    emptyEl.hidden = true;
  }

  let currentDay = null;
  let groupEl = null;

  for (const entry of entries) {
    const key = dayKey(entry.createdAt);
    if (key !== currentDay) {
      currentDay = key;
      groupEl = document.createElement('div');
      groupEl.className = 'day-group';
      const h = document.createElement('h2');
      h.className = 'day-heading';
      h.textContent = dayFmt.format(new Date(entry.createdAt));
      groupEl.appendChild(h);
      entriesEl.appendChild(groupEl);
    }
    groupEl.appendChild(renderEntry(entry));
  }
}

function renderEntry(entry) {
  const el = document.createElement('article');
  el.className = 'entry';

  const meta = document.createElement('div');
  meta.className = 'entry__meta';
  meta.innerHTML = `
    <span>${timeFmt.format(new Date(entry.createdAt))}</span>
    <span class="entry__badge">${entry.source}</span>
    ${entry.transcriptStatus === 'pending' ? '<span class="entry__badge">transcript pending</span>' : ''}
  `;

  // Delete control — pushed to the right by margin-left:auto in the CSS.
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'entry__delete';
  del.textContent = '×'; // ×
  del.setAttribute('aria-label', 'Delete entry');
  del.addEventListener('click', async () => {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    await deleteEntry(entry.id);
    renderTimeline();
  });
  meta.appendChild(del);

  el.appendChild(meta);

  const p = document.createElement('p');
  p.className = 'entry__text';
  p.textContent = entry.text || '(no transcript)';
  el.appendChild(p);

  // Lazily attach an <audio> player for voice entries.
  if (entry.audioId) {
    getAudio(entry.audioId).then((blob) => {
      if (!blob) return;
      const audio = document.createElement('audio');
      audio.className = 'entry__audio';
      audio.controls = true;
      audio.src = URL.createObjectURL(blob);
      el.appendChild(audio);
    });
  }

  return el;
}

// Debounced search so we're not hitting IndexedDB on every keystroke.
let searchTimer = null;
searchEl.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderTimeline, 150);
});
