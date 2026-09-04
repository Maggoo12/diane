/*
 * week.js — the "Week" view: goals, the spoken debrief, and settings.
 * Wires goals.js + debrief.js + speak.js + seed.js to the DOM.
 */

import { initGoals, renderGoals, initNextWeekGoals, renderNextWeekGoals } from './goals.js';
import { initGoalHistory, render as renderGoalHistory } from './goalhistory.js';
import {
  generateSummary, weekAfter,
  getApiKey, setApiKey,
  getModel, setModel,
  getTone, setTone,
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
import { clearAll, getWeekStart, setWeekStart, addGoal, weekOf, completeGoal } from './db.js';
import { BUILD } from './version.js';
import { exportBackup, importBackup, downloadBlob } from './backup.js';
import {
  getReminderSettings, setReminderSettings,
  notificationsSupported, notificationPermission, requestNotificationPermission,
  scheduleReminders, sendTestNotification, explainReminders, fireReminderNow,
  resetReminderState,
} from './reminders.js';
import { previewBar, render as renderReminderBar } from './reminderbar.js';

/** @param {() => void} onDataChange fired after seeding/wiping, to refresh other views */
export function initWeek(onDataChange) {
  initGoals();
  initNextWeekGoals(() => weekAfter(weekOf()));
  initGoalHistory();
  wireDebrief();
  wireSettingsPanel(onDataChange);
  wireBackup(onDataChange);
}

/** Re-render the parts that can change while the view is hidden. */
export function refreshWeek() {
  renderGoals();
  renderNextWeekGoals();
  renderGoalHistory();
}

// --- debrief --------------------------------------------------------
function wireDebrief() {
  const out = document.getElementById('debrief-output');
  const status = document.getElementById('debrief-status');
  const midBtn = document.getElementById('debrief-midweek');
  const weekBtn = document.getElementById('debrief-weekly');
  const playBtn = document.getElementById('debrief-play');
  const goalsBox = document.getElementById('debrief-goals');
  const goalsList = document.getElementById('debrief-goals-list');
  const doneBox = document.getElementById('debrief-done');
  const doneList = document.getElementById('debrief-done-list');

  let lastText = '';

  function renderDoneSuggestions(suggestions) {
    doneList.innerHTML = '';
    if (!suggestions?.length) {
      doneBox.hidden = true;
      return;
    }
    doneBox.hidden = false;
    for (const goal of suggestions) doneList.appendChild(renderDoneRow(goal));
  }

  function renderDoneRow(goal) {
    const row = document.createElement('div');
    row.className = 'goal-suggestion';

    const text = document.createElement('span');
    text.className = 'goal-suggestion__text';
    text.textContent = goal.text;

    const markDone = document.createElement('button');
    markDone.type = 'button';
    markDone.className = 'goal-suggestion__accept';
    markDone.textContent = 'Mark done';
    markDone.addEventListener('click', async () => {
      markDone.disabled = true;
      await completeGoal(goal.id);
      row.remove();
      renderGoals();
    });

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'goal-suggestion__dismiss';
    dismiss.textContent = '×';
    dismiss.setAttribute('aria-label', 'Dismiss suggestion');
    dismiss.addEventListener('click', () => row.remove());

    row.append(text, markDone, dismiss);
    return row;
  }

  function renderSuggestedGoals(suggestions, week) {
    goalsList.innerHTML = '';
    if (!suggestions?.length) {
      goalsBox.hidden = true;
      return;
    }
    goalsBox.hidden = false;
    const targetWeek = weekAfter(week);
    for (const text of suggestions) {
      goalsList.appendChild(renderSuggestionRow(text, targetWeek));
    }
  }

  function renderSuggestionRow(text, targetWeek) {
    const row = document.createElement('div');
    row.className = 'goal-suggestion';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = text;

    const accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'goal-suggestion__accept';
    accept.textContent = 'Accept';
    accept.addEventListener('click', async () => {
      const val = input.value.trim();
      if (!val) return;
      accept.disabled = true;
      await addGoal({ text: val, week: targetWeek });
      row.remove();
      renderGoals();
      renderNextWeekGoals();
    });

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'goal-suggestion__dismiss';
    dismiss.textContent = '×';
    dismiss.setAttribute('aria-label', 'Dismiss suggestion');
    dismiss.addEventListener('click', () => row.remove());

    row.append(input, accept, dismiss);
    return row;
  }

  async function run(mode) {
    midBtn.disabled = weekBtn.disabled = true;
    playBtn.disabled = true;
    stop();
    out.textContent = '';
    status.textContent = 'Thinking…';
    renderSuggestedGoals([]);
    renderDoneSuggestions([]);
    try {
      const { text, source, week, suggestedGoals, suggestedDone } = await generateSummary({ mode });
      lastText = text;
      out.textContent = text;
      status.textContent =
        source === 'local' ? 'Basic summary — add a Claude API key in Settings for the real thing.'
        : source === 'empty' ? ''
        : '';
      playBtn.disabled = !text || !isSpeechSupported();
      renderDoneSuggestions(suggestedDone);
      renderSuggestedGoals(suggestedGoals, week);
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

// --- settings panel (staged: nothing applies until "Save settings") ----
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

let dirty = false;
let repopulate = () => {};

export function settingsDirty() { return dirty; }
export function revertSettings() { repopulate(); }

function wireSettingsPanel(onDataChange) {
  const $ = (id) => document.getElementById(id);
  const buildEl = $('build-number');
  if (buildEl) buildEl.textContent = `Build ${BUILD}`;
  const el = {
    apiKey: $('set-apikey'), model: $('set-model'), tone: $('set-tone'),
    groqKey: $('set-groqkey'), transcribeModel: $('set-transcribe-model'),
    voice: $('set-voice'), rate: $('set-rate'), weekStart: $('set-weekstart'),
    remEnabled: $('rem-enabled'), remDaily: $('rem-daily-time'),
    remWeeklyDay: $('rem-weekly-day'), remWeeklyTime: $('rem-weekly-time'),
    remStatus: $('rem-status'), remTest: $('rem-test'),
    remFire: $('rem-fire'), remDiag: $('rem-diag'), remDiagOut: $('rem-diag-out'),
    remPreview: $('rem-preview'), remReset: $('rem-reset'),
    save: $('settings-save'), dirtyLbl: $('settings-dirty'),
    seed: $('set-seed'), wipe: $('set-wipe'), devStatus: $('settings-status'),
  };

  function setDirty(v) {
    dirty = v;
    el.save.disabled = !v;
    el.dirtyLbl.hidden = !v;
  }
  const markDirty = () => setDirty(true);

  // Weekly-reminder day list, ordered from the chosen first day of the week.
  function fillDayOptions(weekStart, keep) {
    const want = keep ?? Number(el.remWeeklyDay.value);
    el.remWeeklyDay.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      const d = (Number(weekStart) + i) % 7;
      const o = document.createElement('option');
      o.value = String(d);
      o.textContent = DAY_NAMES[d];
      el.remWeeklyDay.appendChild(o);
    }
    el.remWeeklyDay.value = String(Number.isInteger(want) ? want : (Number(weekStart) + 6) % 7);
  }

  if (isSpeechSupported()) {
    onVoicesReady((voices) => {
      const current = el.voice.value || getVoiceURI();
      el.voice.innerHTML = '<option value="">System default</option>';
      for (const v of voices) {
        const o = document.createElement('option');
        o.value = v.voiceURI;
        o.textContent = `${v.name} (${v.lang})`;
        el.voice.appendChild(o);
      }
      el.voice.value = current;
    });
  } else {
    el.voice.disabled = true;
  }

  function showRemStatus() {
    const t = el.remStatus;
    if (!notificationsSupported()) { t.textContent = 'Notifications aren\'t supported in this browser.'; return; }
    const perm = notificationPermission();
    if (perm === 'denied') t.textContent = 'Blocked — turn on notifications for this app in your device settings.';
    else if (!el.remEnabled.checked) t.textContent = '';
    else if (perm !== 'granted') t.textContent = 'Permission needed — re-tick to grant it.';
    else t.textContent = 'On. Web reminders are best-effort — use "Send test notification" to check this device.';
  }

  repopulate = () => {
    el.apiKey.value = getApiKey();
    el.model.value = getModel();
    el.tone.value = getTone();
    el.groqKey.value = getGroqKey();
    el.transcribeModel.value = getTranscribeModel();
    el.voice.value = getVoiceURI();
    el.rate.value = String(getRate());
    el.weekStart.value = String(getWeekStart());
    const r = getReminderSettings();
    el.remEnabled.checked = r.enabled;
    el.remDaily.value = r.dailyTime;
    fillDayOptions(getWeekStart(), r.weeklyDay);
    el.remWeeklyTime.value = r.weeklyTime;
    setDirty(false);
    showRemStatus();
  };

  // Stage-only listeners.
  for (const k of ['apiKey', 'model', 'tone', 'groqKey', 'transcribeModel', 'voice', 'rate', 'remDaily', 'remWeeklyDay', 'remWeeklyTime']) {
    el[k].addEventListener('input', markDirty);
    el[k].addEventListener('change', markDirty);
  }
  el.weekStart.addEventListener('change', () => { fillDayOptions(el.weekStart.value); markDirty(); });

  el.remEnabled.addEventListener('change', async () => {
    if (el.remEnabled.checked && notificationPermission() !== 'granted') {
      const p = await requestNotificationPermission();
      if (p !== 'granted') el.remEnabled.checked = false;
    }
    showRemStatus();
    markDirty();
  });

  el.remTest.addEventListener('click', async () => {
    el.remStatus.textContent = 'Sending test…';
    try {
      await sendTestNotification();
      el.remStatus.textContent = 'Test sent. If nothing appeared, check this app\'s notification permission in your OS settings.';
    } catch (err) {
      el.remStatus.textContent = err.message || String(err);
    }
  });

  el.remFire.addEventListener('click', async () => {
    el.remStatus.textContent = 'Firing the daily reminder now (bypasses all checks)…';
    try {
      await fireReminderNow('daily');
      el.remStatus.textContent = 'Fired. You should see "Anything worth logging today?" with Snooze / Open.';
    } catch (err) {
      el.remStatus.textContent = err.message || String(err);
    }
  });

  el.remDiag.addEventListener('click', async () => {
    el.remDiagOut.hidden = false;
    el.remDiagOut.textContent = 'Checking…';
    try {
      el.remDiagOut.textContent = await explainReminders();
    } catch (err) {
      el.remDiagOut.textContent = err.message || String(err);
    }
  });

  el.remPreview.addEventListener('click', () => {
    previewBar();
    // Close the panel so the bar (in the main view) is visible.
    document.getElementById('settings-panel').hidden = true;
    document.getElementById('settings-backdrop').hidden = true;
  });

  el.remReset.addEventListener('click', async () => {
    await resetReminderState();
    await renderReminderBar();
    el.remStatus.textContent = 'Reminder state cleared. Due reminders will show again.';
  });

  el.save.addEventListener('click', () => {
    setApiKey(el.apiKey.value);
    setModel(el.model.value);
    setTone(el.tone.value);
    setGroqKey(el.groqKey.value);
    setTranscribeModel(el.transcribeModel.value);
    setVoiceURI(el.voice.value);
    setRate(el.rate.value);
    setWeekStart(el.weekStart.value);
    setReminderSettings({
      enabled: el.remEnabled.checked,
      dailyTime: el.remDaily.value,
      weeklyDay: Number(el.remWeeklyDay.value),
      weeklyTime: el.remWeeklyTime.value || '19:00',
    });

    // UI updates immediately; rescheduling notifications is a slow side-effect.
    setDirty(false);
    renderGoals();
    renderNextWeekGoals();
    renderGoalHistory();
    onDataChange?.();
    showRemStatus();
    el.save.textContent = 'Saved';
    setTimeout(() => { el.save.textContent = 'Save settings'; }, 1200);
    scheduleReminders().catch(() => {});
  });

  // Data actions apply immediately — they're not preferences.
  el.seed.addEventListener('click', async () => {
    el.seed.disabled = true;
    try {
      const { entries, goals } = await seedDatabase();
      el.devStatus.textContent = `Loaded ${entries} sample entries and ${goals} goals.`;
      renderGoals();
      renderNextWeekGoals();
      renderGoalHistory();
      onDataChange?.();
    } catch (err) {
      el.devStatus.textContent = err.message || String(err);
    } finally {
      el.seed.disabled = false;
    }
  });
  el.wipe.addEventListener('click', async () => {
    if (!confirm('Delete ALL entries, audio and goals? This cannot be undone.')) return;
    await clearAll();
    el.devStatus.textContent = 'All data cleared.';
    renderGoals();
    renderNextWeekGoals();
    renderGoalHistory();
    onDataChange?.();
  });

  repopulate();
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
      renderNextWeekGoals();
      renderGoalHistory();
      onDataChange?.();
    } catch (err) {
      status.textContent = err.message || String(err);
    } finally {
      importBtn.disabled = false;
      doneBar();
    }
  });
}

