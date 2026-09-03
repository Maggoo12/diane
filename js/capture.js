/*
 * capture.js — the capture moment: voice or text.
 *
 * Voice works two ways off the same button:
 *   - Press and hold, speak, release  (natural on a phone)
 *   - Click once to start, click again to stop  (natural with a mouse)
 * A release within HOLD_MS of the press is treated as a "click" and recording
 * continues until the next click; a longer press stops on release.
 *
 * On start: MediaRecorder archives the audio + the live transcriber runs.
 * On stop:  both end, then one entry is saved via db.addEntry().
 *
 * Design targets from the brief: recording within ~1s of the press, a haptic
 * buzz on save, and it must still save something if transcription fails.
 */

import { addEntry } from './db.js';
import { createTranscriber, isLiveTranscriptionSupported } from './transcribe.js';

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
    await addEntry({ text, source: 'text' });
    textInput.value = '';
    buzz();
    onSaved?.();
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
  let transcriber = null;
  let liveText = '';
  let stream = null;
  let pressStartedAt = 0;
  let busy = false; // true while start/stop is mid-flight, to ignore extra presses

  labelEl.textContent = IDLE_LABEL;
  if (!isLiveTranscriptionSupported()) {
    liveEl.textContent = 'Live transcription unavailable here — audio still saves.';
  }

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
    liveText = '';
    liveEl.textContent = '';

    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    mediaRecorder.start();

    transcriber = createTranscriber({
      onPartial: (t) => {
        liveText = t;
        liveEl.textContent = t;
      },
      onFinal: (t) => {
        if (t) liveText = t;
      },
    });
    transcriber.start();

    holdBtn.classList.add('is-recording');
    labelEl.textContent = 'Tap to stop';
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
    transcriber?.stop();
    await stopped;

    stream.getTracks().forEach((t) => t.stop());

    const audioBlob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
    const text = liveText.trim();

    await addEntry({ text, source: 'voice', audioBlob });
    buzz();

    // reset
    mediaRecorder = null;
    transcriber = null;
    stream = null;
    holdBtn.classList.remove('is-recording');
    labelEl.textContent = IDLE_LABEL;
    liveEl.textContent = text ? '' : 'Saved (no transcript yet).';
    busy = false;

    onSaved?.();
  }

  // Pointer events cover mouse + touch + pen with one code path.
  holdBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    holdBtn.setPointerCapture(e.pointerId);
    if (mediaRecorder) {
      stopRecording(); // already recording (toggle mode) → this press stops it
    } else {
      pressStartedAt = Date.now();
      startRecording();
    }
  });

  function onRelease() {
    // Long press = a deliberate hold, so release stops it. Quick press = a
    // click: leave it recording until the next press.
    if (mediaRecorder && Date.now() - pressStartedAt >= HOLD_MS) {
      stopRecording();
    }
  }
  holdBtn.addEventListener('pointerup', onRelease);
  holdBtn.addEventListener('pointercancel', onRelease);
}

// Short confirm buzz. Silently ignored where the Vibration API is absent.
function buzz() {
  navigator.vibrate?.(40);
}
