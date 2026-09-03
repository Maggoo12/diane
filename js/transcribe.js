/*
 * transcribe.js — the swappable transcription layer.
 *
 * The roadmap calls for ONE seam the rest of the app talks to, so the engine
 * can change later (OS speech-to-text now -> a Whisper-class API for quality).
 *
 * v1 engine: the browser's Web Speech API (SpeechRecognition). It listens to
 * the live mic and streams back text. It does NOT work on a recorded file and
 * needs a network connection on most Android builds — so capture.js always
 * records the audio too, and an entry can be saved with transcriptStatus
 * 'pending' when recognition is unavailable.
 *
 * To swap engines later, write another module that exposes the same
 * createTranscriber() shape and point capture.js at it.
 */

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

export function isLiveTranscriptionSupported() {
  return SpeechRecognition !== null;
}

/**
 * Create a live transcriber tied to one recording session.
 *
 * @param {object} handlers
 * @param {(partialText: string) => void} [handlers.onPartial] fired as words arrive
 * @param {(finalText: string) => void}   [handlers.onFinal]   fired once on stop
 * @returns {{ start: () => void, stop: () => void }}
 */
export function createTranscriber({ onPartial, onFinal } = {}) {
  let finalText = '';

  if (!SpeechRecognition) {
    // Graceful no-op: capture.js still records audio and saves a pending entry.
    return {
      start() {},
      stop() {
        onFinal?.('');
      },
    };
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || 'en-US';

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const chunk = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += chunk + ' ';
      else interim += chunk;
    }
    onPartial?.((finalText + interim).trim());
  };

  recognition.onerror = (event) => {
    // 'no-speech', 'network', 'not-allowed' — non-fatal here. Log and move on;
    // stop() will still deliver whatever finalText we gathered.
    console.warn('[transcribe] recognition error:', event.error);
  };

  return {
    start() {
      finalText = '';
      try {
        recognition.start();
      } catch (err) {
        console.warn('[transcribe] start failed:', err);
      }
    },
    stop() {
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
      onFinal?.(finalText.trim());
    },
  };
}
