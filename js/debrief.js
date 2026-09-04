/*
 * debrief.js — turns a week of entries + goals into a spoken-style summary.
 *
 * This is the swappable "writer" seam. Today it calls Claude directly from the
 * browser with the user's own API key (stored on-device only). Later this same
 * function can point at a managed backend, a different provider, or a local
 * model — callers just get `{ text }` back.
 *
 * With no API key set it falls back to a plain non-AI summary so the rest of
 * the loop (and the TTS) is still testable.
 */

import { getEntriesInRange, getGoals, weekOf } from './db.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-5';

const KEY_APIKEY = 'diane.apiKey';
const KEY_MODEL = 'diane.model';
const KEY_TONE = 'diane.tone';

const DEFAULT_TONE = 'warm';

// --- settings (all on-device) -----------------------------------------
export function getApiKey() {
  return localStorage.getItem(KEY_APIKEY) || '';
}
export function setApiKey(value) {
  const v = (value || '').trim();
  if (v) localStorage.setItem(KEY_APIKEY, v);
  else localStorage.removeItem(KEY_APIKEY);
}
export function getModel() {
  return localStorage.getItem(KEY_MODEL) || DEFAULT_MODEL;
}
export function setModel(value) {
  localStorage.setItem(KEY_MODEL, value || DEFAULT_MODEL);
}
export function getTone() {
  const t = localStorage.getItem(KEY_TONE);
  return TONES[t] ? t : DEFAULT_TONE;
}
export function setTone(value) {
  localStorage.setItem(KEY_TONE, TONES[value] ? value : DEFAULT_TONE);
}

// --- gathering the week ----------------------------------------------
function weekRange(week) {
  const start = new Date(week + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

/** Entries (oldest first) + goals for one week. */
export async function collectWeek(week = weekOf()) {
  const { startISO, endISO } = weekRange(week);
  const entries = await getEntriesInRange(startISO, endISO);
  entries.reverse(); // getEntriesInRange is newest-first; read oldest-first
  const goals = await getGoals(week);
  return { week, entries, goals };
}

/** The week immediately following `week` — where accepted goal suggestions land. */
export function weekAfter(week) {
  const d = new Date(`${week}T00:00:00`);
  d.setDate(d.getDate() + 7);
  return weekOf(d);
}

// --- prompt --------------------------------------------------------
const SYSTEM_BASE = `You are Diane, the voice of a personal journal. Once a week you narrate a short spoken debrief of how the user's week went, working only from the journal entries and goals they give you.

Speak directly to the user as "you". It is read aloud, so write flowing prose in short paragraphs — no headings, no bullet points, no markdown, no emoji. Around 200-350 words for a weekly debrief; shorter is fine if the week was quiet.

What to cover:
- How the week actually felt, in the user's own themes. Name the throughlines you see across entries.
- Progress on the goals they set: what moved, what didn't.
- One or two specific moments worth remembering.
- If they said they would do something and there is no sign they did, mention it once.

Use only what is in the entries and goals. Do not invent events, feelings, or outcomes. If something is ambiguous, say so or leave it out.`;

const TONES = {
  warm: 'TONE: Warm and attentive, like a close friend who was genuinely paying attention all week. Encouraging without being a cheerleader; a little dry humour is welcome. Kind about the goals that slipped. Never clinical, never a hype machine, never a therapist.',
  dry: 'TONE: Dry and wry — understated, a touch of deadpan, the voice of a sharp assistant who has read your week and has opinions. Observant, lightly teasing about what you dodged, but always on your side. A witty butler, not a stand-up act.',
  direct: 'TONE: Plain and direct. Report what happened and where the goals stand in clear sentences, with minimal editorialising. No pep, no padding, no jokes. Respect the user\'s time.',
  coach: 'TONE: Direct and a little demanding, like a coach who respects you enough to be honest. Name the slippage plainly, don\'t soften the goals you missed, and end on the one thing that matters most next week. Firm, not unkind.',
};

const MIDWEEK_NOTE = `

This request is a MID-WEEK check-in, not an end-of-week recap. The week is not over. Frame it as "here is where things stand", point at what is still open with time to act on it, and keep it brief — 120-200 words. Keep the tone above; if a stated intention has not happened yet and there is still time, nudge them about it.`;

const GOALS_NOTE = `

After the debrief text, on its own line write exactly ---GOALS--- and nothing else on that line. Then list 0 to 4 goals worth carrying into the COMING week — things mentioned this week that seem to matter but are not resolved. One per line, each starting with "- ". Only suggest something with real signal in the entries; it is fine to suggest none, in which case write nothing after the marker. Never mention this marker or these goals inside the spoken debrief text itself.`;

function buildSystem(mode) {
  const s = `${SYSTEM_BASE}\n\n${TONES[getTone()] || TONES.warm}`;
  return mode === 'midweek' ? s + MIDWEEK_NOTE : s + GOALS_NOTE;
}

function fmtWhen(iso) {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} ${time}`;
}

function buildUserMessage({ week, entries, goals }, mode) {
  const lines = [];
  lines.push(`Week of ${week} (${mode === 'midweek' ? 'in progress' : 'just ended'}).`);
  lines.push('');

  if (goals.length) {
    lines.push('GOALS I SET FOR THIS WEEK:');
    for (const g of goals) {
      lines.push(`- ${g.text} — ${g.done ? 'marked done' : 'not marked done'}`);
    }
  } else {
    lines.push('I did not set any goals for this week.');
  }
  lines.push('');

  lines.push('MY ENTRIES THIS WEEK (oldest first):');
  for (const e of entries) {
    lines.push(`[${fmtWhen(e.createdAt)}, ${e.source}] ${e.text}`);
  }
  lines.push('');
  lines.push(mode === 'midweek' ? 'Give me my mid-week check-in.' : 'Give me my weekly debrief.');
  return lines.join('\n');
}

// --- the engine --------------------------------------------------
/**
 * @param {{ mode?: 'weekly'|'midweek', week?: string }} opts
 * @returns {Promise<{ text: string, source: 'claude'|'local'|'empty', week: string, suggestedGoals: string[] }>}
 */
export async function generateSummary({ mode = 'weekly', week = weekOf() } = {}) {
  const data = await collectWeek(week);

  if (!data.entries.length) {
    return {
      source: 'empty',
      week,
      suggestedGoals: [],
      text: "There aren't any entries for this week yet, so there's nothing to look back on. Come back once you've written a few.",
    };
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return { source: 'local', week, suggestedGoals: [], text: localSummary(data, mode) };
  }

  const { text, suggestedGoals } = await callClaude({ apiKey, model: getModel(), data, mode });
  return { source: 'claude', week, text, suggestedGoals: mode === 'weekly' ? suggestedGoals : [] };
}

async function callClaude({ apiKey, model, data, mode }) {
  let res;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system: buildSystem(mode),
        messages: [{ role: 'user', content: buildUserMessage(data, mode) }],
      }),
    });
  } catch (err) {
    // Network error or the browser blocking the cross-origin call.
    throw new Error(`Couldn't reach the Claude API (${err.message}). Check your connection.`);
  }

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error?.message || JSON.stringify(body);
    } catch {
      detail = await res.text().catch(() => '');
    }
    if (res.status === 401) throw new Error('Claude rejected the API key (401). Check it in Settings.');
    if (res.status === 429) throw new Error('Rate limited or out of credit (429). Try again shortly.');
    throw new Error(`Claude API error ${res.status}: ${String(detail).slice(0, 300)}`);
  }

  const json = await res.json();
  const raw = (json.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!raw) throw new Error('Claude returned an empty response.');
  return parseGoalsMarker(raw);
}

const GOALS_MARKER = '---GOALS---';

/** Split the response into the spoken text and any suggested-goals lines. */
function parseGoalsMarker(raw) {
  const idx = raw.indexOf(GOALS_MARKER);
  if (idx === -1) return { text: raw, suggestedGoals: [] };
  const text = raw.slice(0, idx).trim();
  const suggestedGoals = raw
    .slice(idx + GOALS_MARKER.length)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim())
    .filter(Boolean);
  return { text, suggestedGoals };
}

// --- no-API fallback ------------------------------------------------
function localSummary({ entries, goals }, mode) {
  const days = new Set(entries.map((e) => e.createdAt.slice(0, 10))).size;
  const voice = entries.filter((e) => e.source === 'voice').length;

  const parts = [];
  parts.push(
    `${mode === 'midweek' ? 'So far this week' : 'This week'} you wrote ${entries.length} ` +
      `${entries.length === 1 ? 'entry' : 'entries'} across ${days} ${days === 1 ? 'day' : 'days'}` +
      `${voice ? `, ${voice} of them spoken` : ''}.`
  );

  if (goals.length) {
    const done = goals.filter((g) => g.done);
    const open = goals.filter((g) => !g.done);
    if (done.length) parts.push(`Marked done: ${done.map((g) => g.text).join('; ')}.`);
    if (open.length) parts.push(`Still open: ${open.map((g) => g.text).join('; ')}.`);
  } else {
    parts.push('No goals were set for this week.');
  }

  parts.push('(This is the basic summary — add a Claude API key in Settings for a written debrief.)');
  return parts.join('\n\n');
}
