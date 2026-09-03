/*
 * backup.js — export the whole journal to one file, and import it back.
 *
 * Diane is local-first: an uninstall, a cleared browser, or a lost phone
 * wipes everything. This is the escape hatch.
 *
 * Format: a single JSON file. Entries and goals inline; audio recordings as
 * base64 (keeps it one portable file, no zip library / no build step). A
 * month of short voice notes is a few MB — fine.
 */

import {
  getAllEntries, getAllGoals, getAllAudio, restoreAll,
} from './db.js';

const FORMAT = { app: 'diane', version: 1 };

// --- base64 <-> blob ----------------------------------------------
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
function base64ToBlob(b64, type) {
  const bin = atob(b64 || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: type || 'audio/webm' });
}

// --- export ------------------------------------------------------
/**
 * @param {(done:number,total:number)=>void} [onProgress]
 * @returns {Promise<{blob: Blob, filename: string, counts: object}>}
 */
export async function exportBackup(onProgress) {
  const entries = await getAllEntries();
  const goals = await getAllGoals();
  const audioRecs = await getAllAudio(); // [{ id, blob }]

  const total = audioRecs.length || 1;
  const audio = [];
  for (let i = 0; i < audioRecs.length; i++) {
    const { id, blob } = audioRecs[i];
    audio.push({ id, type: blob.type || 'audio/webm', data: await blobToBase64(blob) });
    onProgress?.(i + 1, total);
  }
  onProgress?.(total, total);

  const doc = {
    ...FORMAT,
    exportedAt: new Date().toISOString(),
    entries,
    goals,
    audio,
  };
  const blob = new Blob([JSON.stringify(doc)], { type: 'application/json' });
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    blob,
    filename: `diane-backup-${stamp}.json`,
    counts: { entries: entries.length, goals: goals.length, audio: audio.length },
  };
}

/** Trigger a file download for a blob (works in a normal tab; see note in UI). */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// --- import ----------------------------------------------------
/**
 * @param {File} file  a diane-backup-*.json
 * @param {{replace?: boolean, onProgress?: (done:number,total:number)=>void}} opts
 * @returns {Promise<{entries:number, goals:number, audio:number}>}
 */
export async function importBackup(file, { replace = true, onProgress } = {}) {
  const text = await file.text();
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new Error('That file isn\'t valid JSON.');
  }
  if (doc.app !== 'diane' || !Array.isArray(doc.entries)) {
    throw new Error('That doesn\'t look like a Diane backup.');
  }

  const audio = (doc.audio || []).map((a) => ({
    id: a.id,
    blob: base64ToBlob(a.data, a.type),
  }));

  return restoreAll(
    { entries: doc.entries, goals: doc.goals || [], audio },
    { replace, onProgress }
  );
}
