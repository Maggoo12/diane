/*
 * week.js — the "Week" view: goals, the spoken debrief, and settings.
 * Wires goals.js + debrief.js + speak.js + seed.js to the DOM.
 */

import { initGoals, renderGoals } from './goals.js';
import {
  generateSummary,
  getApiKey, setApiKey,
  getModel, setModel,
} from './debrief.js';
import {
  speak, stop, isSpeaking, isSpeechSupported,
  onVoicesReady, getVoiceURI, setVoiceURI, getRate, setRate,
} from './speak.js';
import {
  getGroqKey, setGroqKey,
  getTranscribeModel, setTranscribeModel,
} from './transcribe.js';
import { seedDatabase } from './seed.js';
import { clearAll } from './db.js';

/** @param {() => void} onDataChange fired after seeding/wiping, to refresh other views */
export function initWeek(onDataChange) {
  initGoals();
  wireDebrief();
  wireSettings(onDataChange);
}

/** Re-render the parts that can change while the view is hidden. */
export function refreshWeek() {
  renderGoals();
}

// --- debrief --------------------------------------------------------
function wireDebrief() {
  const out = document.getElementById('debrief-output');
  const status = document.getElementById('debrief-status');
  const midBtn = document.getElementById('debrief-midweek');
  const weekBtn = document.getElementById('debrief-weekly');
  const playBtn = document.getElementById('debrief-play');

  let lastText = '';

  async function run(mode) {
    midBtn.disabled = weekBtn.disabled = true;
    playBtn.disabled = true;
    stop();
    out.textContent = '';
    status.textContent = 'Thinking…';
    try {
      const { text, source } = await generateSummary({ mode });
      lastText = text;
      out.textContent = text;
      status.textContent =
        source === 'local' ? 'Basic summary — add a Claude API key in Settings for the real thing.'
        : source === 'empty' ? ''
        : '';
      playBtn.disabled = !text || !isSpeechSupported();
    } catch (err) {
      status.textContent = err.message || String(err);
    } finally {
      midBtn.disabled = weekBtn.disabled = false;
    }
  }

  midBtn.addEventListener('click', () => run('midweek'));
  weekBtn.addEventListener('click', () => run('weekly'));

  playBtn.addEventListener('click', () => {
    if (isSpeaking()) {
      stop();
      playBtn.textContent = '▶ Play';
      return;
    }
    speak(lastText, {
      onstart: () => { playBtn.textContent = '■ Stop'; },
      onend: () => { playBtn.textContent = '▶ Play'; },
      onerror: (e) => {
        playBtn.textContent = '▶ Play';
        status.textContent = e.message || String(e);
      },
    });
  });

  if (!isSpeechSupported()) {
    playBtn.disabled = true;
    playBtn.title = 'This browser has no speech synthesis';
  }
}

// --- settings ------------------------------------------------------
function wireSettings(onDataChange) {
  const apiKeyEl = document.getElementById('set-apikey');
  const modelEl = document.getElementById('set-model');
  const groqKeyEl = document.getElementById('set-groqkey');
  const transcribeModelEl = document.getElementById('set-transcribe-model');
  const voiceEl = document.getElementById('set-voice');
  const rateEl = document.getElementById('set-rate');
  const seedBtn = document.getElementById('set-seed');
  const wipeBtn = document.getElementById('set-wipe');
  const status = document.getElementById('debrief-status');

  apiKeyEl.value = getApiKey();
  apiKeyEl.addEventListener('change', () => setApiKey(apiKeyEl.value));

  modelEl.value = getModel();
  modelEl.addEventListener('change', () => setModel(modelEl.value));

  groqKeyEl.value = getGroqKey();
  groqKeyEl.addEventListener('change', () => setGroqKey(groqKeyEl.value));

  transcribeModelEl.value = getTranscribeModel();
  transcribeModelEl.addEventListener('change', () => setTranscribeModel(transcribeModelEl.value));

  if (isSpeechSupported()) {
    onVoicesReady((voices) => {
      const current = getVoiceURI();
      voiceEl.innerHTML = '<option value="">System default</option>';
      for (const v of voices) {
        const o = document.createElement('option');
        o.value = v.voiceURI;
        o.textContent = `${v.name} (${v.lang})`;
        if (v.voiceURI === current) o.selected = true;
        voiceEl.appendChild(o);
      }
    });
    voiceEl.addEventListener('change', () => setVoiceURI(voiceEl.value));
  } else {
    voiceEl.disabled = true;
  }

  rateEl.value = String(getRate());
  rateEl.addEventListener('input', () => setRate(rateEl.value));

  seedBtn.addEventListener('click', async () => {
    seedBtn.disabled = true;
    try {
      const { entries, goals } = await seedDatabase();
      status.textContent = `Loaded ${entries} sample entries and ${goals} goals.`;
      renderGoals();
      onDataChange?.();
    } catch (err) {
      status.textContent = err.message || String(err);
    } finally {
      seedBtn.disabled = false;
    }
  });

  wipeBtn.addEventListener('click', async () => {
    if (!confirm('Delete ALL entries, audio and goals? This cannot be undone.')) return;
    await clearAll();
    status.textContent = 'All data cleared.';
    renderGoals();
    onDataChange?.();
  });
}
