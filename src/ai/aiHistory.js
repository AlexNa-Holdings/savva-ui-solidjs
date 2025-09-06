// src/ai/aiHistory.js
const KEY_PREFIX = "savva.ai.snapshots.";
const MAX_SNAPSHOTS = 5;

function deepClone(v) {
  try { return structuredClone(v); } catch {}
  return JSON.parse(JSON.stringify(v));
}

function loadList(key) {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveList(key, list) {
  try { localStorage.setItem(KEY_PREFIX + key, JSON.stringify(list)); } catch {}
}

export function snapshotBeforeAi(draftKey, state, meta = {}) {
  const snap = { ts: Date.now(), meta, state: deepClone(state) };
  const list = loadList(draftKey);
  list.push(snap);
  if (list.length > MAX_SNAPSHOTS) list.shift();
  saveList(draftKey, list);
  return snap;
}

export function undoLastAi(draftKey) {
  const list = loadList(draftKey);
  const snap = list.pop();
  saveList(draftKey, list);
  return snap?.state;
}

/** Drop the most recent snapshot without restoring it (used on Confirm). */
export function dropLastAiSnapshot(draftKey) {
  const list = loadList(draftKey);
  if (list.length > 0) {
    list.pop();
    saveList(draftKey, list);
  }
}
