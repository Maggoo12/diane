/*
 * capture.js — the capture moment: voice or text.
 *
 * Voice works two ways off the same button:
 *   - Press and hold, speak, release  (natural on a phone)
 *   - Click once to start, click again to stop  (natural with a mouse)
 * A release within HOLD_MS of the press is treated as a "click" and recording
 * continues until the next click; a longer press stops on release.
 *
 * On start: MediaRecorder archives the audio.
 * On stop:  the entry is saved immediately (audio + "transcript pending"),
 *           then the blob is sent to transcribe() in the background and the
 *           entry's text is filled in when it returns. A slow or failed
 *           transcription never blocks or loses the capture.
 *
 * Design targets from the brief: recording within ~1s of the press, a haptic
 * buzz on save, and it must still save something if transcription fails.
 */

import { addEntry, setEntryTranscript, setEntryGoalAction, addGoal, getAllGoals, completeGoal } from './db.js';
import { transcribe, isTranscriptionConfigured } from './transcribe.js';
import { parseGoalTrigger, parseGoalCompletion, findMatchingGoal } from './goaltrigger.js';

/**
 * Wire up the voice + text capture UI.
 * @param {() => void} onSaved called after an entry is stored (to refresh the timeline)
 */
export function initCapture(onSaved) {
  const holdBtn = document.getElementById('hold-btn');
  const liveEl = document.getElementById('live-transcript');
  const textInput = document.getElementById('text-input');
  const textSave = document.getElementById('text-save');
  const modeVoice = document.getElementById('mode-voice');
  const modeText = document.getElementById('mode-text');
  const voicePane = document.getElementById('voice-pane');
  const textPane = document.getElementById('text-pane');
  const statusEl = document.getElementById('capture-status');

  // "Add a goal to X" / "remind me to X" and "goal X completed" — explicit
  // commands, so they act right away (no LLM, see goaltrigger.js). The entry
  // itself still saves normally either way. Completion is checked first —
  // see the comment in goaltrigger.js on why the order matters.
  let statusTimer = null;
  function showCaptureStatus(text) {
    if (!statusEl) return;
    clearTimeout(statusTimer);
    statusEl.textContent = text;
    statusTimer = setTimeout(() => { statusEl.textContent = ''; }, 5000);
  }

  async function checkGoalCommands(text, entryId) {
    const completionPhrase = parseGoalCompletion(text);
    if (completionPhrase) {
      // Any not-yet-done goal, any week — a spoken "complete goal X" has no
      // way to say which week, and an unfinished goal easily ages into a
      // past week before you get round to it.
      const undone = (await getAllGoals()).filter((g) => !g.done);
      const match = findMatchingGoal(completionPhrase, undone);
      if (match) {
        await completeGoal(match.id);
        showCaptureStatus(`✓ Marked done: "${match.text}"`);
        if (entryId) {
          await setEntryGoalAction(entryId, { type: 'completed', text: match.text });
          onSaved?.();
        }
      } else {
        showCaptureStatus(`Heard "${completionPhrase}" as a goal-completed command but couldn't match it to a goal.`);
      }
      return;
    }

    const goal = parseGoalTrigger(text);
    if (goal) {
      const created = await addGoal({ text: goal });
      showCaptureStatus(`✓ Added goal: "${created.text}"`);
      if (entryId) {
        await setEntryGoalAction(entryId, { type: 'added', text: created.text });
        onSaved?.();
      }
    }
  }

  // --- mode toggle -------------------------------------------------------
  function setMode(mode) {
    const voice = mode === 'voice';
    modeVoice.classList.toggle('is-active', voice);
    modeText.classList.toggle('is-active', !voice);
    modeVoice.setAttribute('aria-selected', String(voice));
    modeText.setAttribute('aria-selected', String(!voice));
    voicePane.hidden = !voice;
    textPane.hidden = voice;
  }
  modeVoice.addEventListener('click', () => setMode('voice'));
  modeText.addEventListener('click', () => setMode('text'));

  // --- text capture ----------------------------------------------------
  const textHint = document.getElementById('text-hint');

  // A coarse pointer means a touch device (phone/tablet). There, the Return
  // key must stay a normal newline — the Save button is how you submit. On a
  // real keyboard we follow the chat convention: Enter sends, Shift+Enter is
  // a newline. Ctrl/Cmd+Enter always sends, on any device.
  const touchDevice = window.matchMedia('(pointer: coarse)').matches;
  if (textHint) {
    textHint.textContent = touchDevice
      ? 'Tap Save to add your entry'
      : 'Enter to save · Shift+Enter for a new line';
  }

  async function saveText() {
    const text = textInput.value.trim();
    if (!text) return;
    const entry = await addEntry({ text, source: 'text' });
    textInput.value = '';
    buzz();
    onSaved?.();
    checkGoalCommands(text, entry.id);
  }

  textSave.addEventListener('click', saveText);

  textInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return; // ignore IME composition

    if (e.ctrlKey || e.metaKey) {   // Ctrl/Cmd+Enter — always submit
      e.preventDefault();
      saveText();
      return;
    }
    if (e.shiftKey || touchDevice) return; // newline: let the keypress through

    e.preventDefault();             // desktop plain Enter — submit
    saveText();
  });

  // --- voice capture -------------------------------------------------
  const HOLD_MS = 400; // press shorter than this = a "click" (toggle mode)
  const labelEl = holdBtn.querySelector('.hold-btn__label');
  const IDLE_LABEL = 'Hold or tap to record';

  let mediaRecorder = null;
  let chunks = [];
  let stream = null;
  let pressStartedAt = 0;
  let pointerDown = false; // is the finger still on the button right now
  let busy = false; // true while start/stop is mid-flight, to ignore extra presses

  labelEl.textContent = IDLE_LABEL;

  async function startRecording() {
    if (mediaRecorder || busy) return;
    busy = true;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      liveEl.textContent = 'Microphone permission needed.';
      console.warn('[capture] getUserMedia failed:', err);
      busy = false;
      return;
    }

    chunks = [];
    liveEl.textContent = '';

    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    mediaRecorder.start();

    holdBtn.classList.add('is-recording');
    // If the finger is still down we're in a hold; if it already lifted (a
    // quick tap, or the mic prompt outlasted the press) we're in tap mode.
    labelEl.textContent = pointerDown ? 'Release to stop' : 'Tap to stop';
    busy = false;
  }

  async function stopRecording() {
    if (!mediaRecorder || busy) return;
    busy = true;

    // Wait for the recorder to flush its last chunk.
    const stopped = new Promise((resolve) => {
      mediaRecorder.onstop = resolve;
    });
    mediaRecorder.stop();
    await stopped;

    stream.getTracks().forEach((t) => t.stop());
    const audioBlob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });

    // Save immediately so a slow or failed transcription can't lose the capture.
    const entry = await addEntry({ text: '', source: 'voice', audioBlob });
    buzz();

    mediaRecorder = null;
    stream = null;
    holdBtn.classList.remove('is-recording');
    labelEl.textContent = IDLE_LABEL;
    busy = false;
    onSaved?.();

    // Then transcribe in the background and fill the text in when it lands.
    if (!isTranscriptionConfigured()) {
      liveEl.textContent = 'Saved. Add a Groq key in Settings to transcribe voice notes.';
      return;
    }
    liveEl.textContent = 'Transcribing…';
    try {
      const text = await transcribe(audioBlob);
      if (text) {
        await setEntryTranscript(entry.id, text);
        onSaved?.();
        checkGoalCommands(text, entry.id);
      }
      liveEl.textContent = '';
    } catch (err) {
      console.warn('[capture] transcription failed:', err);
      liveEl.textContent = err.message || 'Transcription failed — audio saved, tap ↻ on the entry to retry.';
    }
  }

  // Pointer events cover mouse + touch + pen with one code path.
  holdBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    holdBtn.setPointerCapture(e.pointerId);
    if (mediaRecorder) {
      stopRecording(); // already recording (toggle mode) → this press stops it
    } else {
      pointerDown = true;
      pressStartedAt = Date.now();
      startRecording();
    }
  });

  function onRelease() {
    pointerDown = false;
    if (!mediaRecorder) return; // still starting up; startRecording sorts the label
    if (Date.now() - pressStartedAt >= HOLD_MS) {
      stopRecording(); // it was a deliberate hold — release ends it
    } else {
      labelEl.textContent = 'Tap to stop'; // it was a tap — keep recording
    }
  }
  holdBtn.addEventListener('pointerup', onRelease);
  holdBtn.addEventListener('pointercancel', onRelease);
}

// Short confirm buzz. Silently ignored where the Vibration API is absent.
function buzz() {
  navigator.vibrate?.(40);
}
