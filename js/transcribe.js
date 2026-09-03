/*
 * transcribe.js — the swappable "ears" seam: an audio blob in, text out.
 *
 * v1 engine: Groq's Whisper endpoint (OpenAI-compatible). It's a single HTTPS
 * POST with the recorded file — reliable in an installed PWA, works on any
 * network that can reach Groq, and Groq's free tier covers personal use.
 *
 * The earlier engine (browser SpeechRecognition) was abandoned: it streams to
 * Google's servers and failed with a `network` error on the dev devices, and
 * never worked offline.
 *
 * To swap engines later (OpenAI, a self-hosted Whisper, a managed backend),
 * replace transcribe() with something of the same shape: (Blob) => Promise<string>.
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const DEFAULT_MODEL = 'whisper-large-v3-turbo';

const KEY_GROQ = 'diane.groqKey';
const KEY_MODEL = 'diane.transcribeModel';

// --- settings (on-device) --------------------------------------------
export function getGroqKey() {
  return localStorage.getItem(KEY_GROQ) || '';
}
export function setGroqKey(value) {
  const v = (value || '').trim();
  if (v) localStorage.setItem(KEY_GROQ, v);
  else localStorage.removeItem(KEY_GROQ);
}
export function getTranscribeModel() {
  return localStorage.getItem(KEY_MODEL) || DEFAULT_MODEL;
}
export function setTranscribeModel(value) {
  localStorage.setItem(KEY_MODEL, value || DEFAULT_MODEL);
}

/** True once a Groq key is set — voice entries only transcribe when this is. */
export function isTranscriptionConfigured() {
  return getGroqKey().length > 0;
}

// --- the engine --------------------------------------------------
/**
 * Transcribe one recorded audio blob.
 * @param {Blob} blob  audio from MediaRecorder (webm/opus, mp4, …)
 * @returns {Promise<string>} the transcript; '' when no key is configured
 * @throws on a network or API error (caller keeps the entry as 'pending')
 */
export async function transcribe(blob) {
  const key = getGroqKey();
  if (!key) return '';

  const form = new FormData();
  form.append('file', blob, `recording.${extFromMime(blob.type)}`);
  form.append('model', getTranscribeModel());
  form.append('response_format', 'json');
  form.append('temperature', '0');

  let res;
  try {
    res = await fetch(GROQ_URL, {
      method: 'POST',
      // Don't set Content-Type — the browser adds the multipart boundary.
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } catch (err) {
    throw new Error(`Couldn't reach Groq (${err.message}). Check your connection.`);
  }

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error?.message || JSON.stringify(body);
    } catch {
      detail = await res.text().catch(() => '');
    }
    if (res.status === 401) throw new Error('Groq rejected the API key (401). Check it in Settings.');
    if (res.status === 429) throw new Error('Groq rate limit or quota hit (429). Try again shortly.');
    throw new Error(`Groq transcription error ${res.status}: ${String(detail).slice(0, 300)}`);
  }

  const json = await res.json();
  return (json.text || '').trim();
}

function extFromMime(mime = '') {
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  return 'webm';
}
