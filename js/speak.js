/*
 * speak.js — the "narrator" seam: text in, spoken audio out.
 *
 * v1 engine: the browser's built-in speechSynthesis. Free, no key, offline on
 * most platforms. Voices are the OS ones (Android/Chrome give you several) —
 * fine for testing, not the eventual shipped experience. A good cloud voice
 * later slots in behind this same speak() call.
 *
 * Two browser quirks handled here:
 *   - voices load asynchronously (getVoices() is empty on first call)
 *   - a single long utterance gets cut off after ~15s in Chrome, so the text
 *     is spoken as a queue of short sentence chunks instead
 */

const KEY_VOICE = 'diane.voiceURI';
const KEY_RATE = 'diane.rate';

export function isSpeechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// --- voices -------------------------------------------------------
export function listVoices() {
  return isSpeechSupported() ? window.speechSynthesis.getVoices() : [];
}

/** Call `cb(voices)` now if they're ready, and again if/when they load. */
export function onVoicesReady(cb) {
  if (!isSpeechSupported()) return;
  const initial = listVoices();
  if (initial.length) cb(initial);
  window.speechSynthesis.onvoiceschanged = () => cb(listVoices());
}

// --- settings (on-device) --------------------------------------
export function getVoiceURI() {
  return localStorage.getItem(KEY_VOICE) || '';
}
export function setVoiceURI(uri) {
  if (uri) localStorage.setItem(KEY_VOICE, uri);
  else localStorage.removeItem(KEY_VOICE);
}
export function getRate() {
  return Number(localStorage.getItem(KEY_RATE)) || 1;
}
export function setRate(rate) {
  localStorage.setItem(KEY_RATE, String(rate));
}

// --- playback -------------------------------------------------
let keepAlive = null;

function splitIntoChunks(text) {
  const sentences = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*\s*/g) || [text];
  const chunks = [];
  let buf = '';
  for (const s of sentences) {
    if (buf && (buf + s).length > 220) {
      chunks.push(buf.trim());
      buf = s;
    } else {
      buf += s;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

/**
 * Speak `text`. Callbacks: onstart (first chunk begins), onend (last chunk
 * finishes), onerror.
 */
export function speak(text, { onstart, onend, onerror } = {}) {
  if (!isSpeechSupported()) {
    onerror?.(new Error('This browser has no speech synthesis.'));
    return;
  }
  stop();

  const chunks = splitIntoChunks(text);
  const voice = listVoices().find((v) => v.voiceURI === getVoiceURI());
  const rate = getRate();

  chunks.forEach((chunk, i) => {
    const u = new SpeechSynthesisUtterance(chunk);
    if (voice) u.voice = voice;
    u.rate = rate;
    if (i === 0) u.onstart = () => onstart?.();
    if (i === chunks.length - 1) {
      u.onend = () => {
        clearKeepAlive();
        onend?.();
      };
    }
    u.onerror = (e) => {
      clearKeepAlive();
      onerror?.(e.error || new Error('Speech synthesis failed.'));
    };
    window.speechSynthesis.speak(u);
  });

  // Chrome pauses synthesis when it loses focus; a periodic resume keeps it going.
  keepAlive = setInterval(() => {
    if (!window.speechSynthesis.speaking) return clearKeepAlive();
    window.speechSynthesis.resume();
  }, 8000);
}

export function stop() {
  clearKeepAlive();
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}

export function isSpeaking() {
  return isSpeechSupported() && window.speechSynthesis.speaking;
}

function clearKeepAlive() {
  if (keepAlive) {
    clearInterval(keepAlive);
    keepAlive = null;
  }
}
