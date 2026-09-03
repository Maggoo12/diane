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
import { exportBackup, importBackup, downloadBlob } from './backup.js';
import {
  getReminderSettings, setReminderSettings,
  notificationsSupported, notificationPermission, requestNotificationPermission,
  scheduleReminders,
} from './reminders.js';

/** @param {() => void} onDataChange fired after seeding/wiping, to refresh other views */
export function initWeek(onDataChange) {
  initGoals();
  wireDebrief();
  wireSettings(onDataChange);
  wireBackup(onDataChange);
  wireReminders();
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
  const status = document.getElementById('settings-status');

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

// --- backup ------------------------------------------------------
function wireBackup(onDataChange) {
  const exportBtn = document.getElementById('backup-export');
  const importBtn = document.getElementById('backup-import-btn');
  const fileInput = document.getElementById('backup-import-file');
  const progress = document.getElementById('backup-progress');
  const bar = progress.querySelector('.progress__bar');
  const status = document.getElementById('backup-status');

  const setBar = (done, total) => {
    progress.hidden = false;
    bar.style.width = `${Math.round((done / Math.max(total, 1)) * 100)}%`;
  };
  const doneBar = () => setTimeout(() => { progress.hidden = true; bar.style.width = '0%'; }, 600);

  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    status.textContent = 'Preparing backup…';
    try {
      const { blob, filename, counts } = await exportBackup(setBar);
      downloadBlob(blob, filename);
      status.textContent = `Exported ${counts.entries} entries, ${counts.goals} goals, ${counts.audio} recordings → ${filename}`;
    } catch (err) {
      status.textContent = err.message || String(err);
    } finally {
      exportBtn.disabled = false;
      doneBar();
    }
  });

  importBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    if (!confirm('Import will REPLACE everything currently in Diane on this device. Continue?')) return;

    importBtn.disabled = true;
    status.textContent = 'Importing…';
    try {
      const counts = await importBackup(file, { replace: true, onProgress: setBar });
      status.textContent = `Imported ${counts.entries} entries, ${counts.goals} goals, ${counts.audio} recordings.`;
      renderGoals();
      onDataChange?.();
    } catch (err) {
      status.textContent = err.message || String(err);
    } finally {
      importBtn.disabled = false;
      doneBar();
    }
  });
}

// --- reminders --------------------------------------------------
function wireReminders() {
  const enabledEl = document.getElementById('rem-enabled');
  const dailyEl = document.getElementById('rem-daily-time');
  const weeklyDayEl = document.getElementById('rem-weekly-day');
  const weeklyTimeEl = document.getElementById('rem-weekly-time');
  const status = document.getElementById('rem-status');

  const s = getReminderSettings();
  enabledEl.checked = s.enabled;
  dailyEl.value = s.dailyTime;
  weeklyDayEl.value = String(s.weeklyDay);
  weeklyTimeEl.value = s.weeklyTime;

  function showStatus() {
    if (!notificationsSupported()) { status.textContent = 'Notifications aren\'t supported in this browser.'; return; }
    const perm = notificationPermission();
    if (perm === 'denied') status.textContent = 'Notifications are blocked — allow them in your browser settings.';
    else if (!enabledEl.checked) status.textContent = '';
    else if (perm !== 'granted') status.textContent = 'Tap the checkbox again to grant permission.';
    else status.textContent = 'On. Scheduled notifications are best-effort on the web — tell us if they don\'t fire.';
  }
  showStatus();

  async function apply() {
    setReminderSettings({
      enabled: enabledEl.checked,
      dailyTime: dailyEl.value,
      weeklyDay: Number(weeklyDayEl.value),
      weeklyTime: weeklyTimeEl.value || '19:00',
    });
    await scheduleReminders();
    showStatus();
  }

  enabledEl.addEventListener('change', async () => {
    if (enabledEl.checked) {
      const perm = await requestNotificationPermission();
      if (perm !== 'granted') { enabledEl.checked = false; showStatus(); return; }
    }
    apply();
  });
  dailyEl.addEventListener('change', apply);
  weeklyDayEl.addEventListener('change', apply);
  weeklyTimeEl.addEventListener('change', apply);
}
