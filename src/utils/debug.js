// src/utils/debug.js
import { createSignal } from "solid-js";

const STORAGE_KEY = "savva_debug_enabled";

const initial = (() => {
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
})();

const [enabled, setEnabledSignal] = createSignal(initial);

function setEnabled(on) {
  setEnabledSignal(!!on);
  try { localStorage.setItem(STORAGE_KEY, on ? "1" : "0"); } catch {}
}

function fmt(tag, args) {
  const ts = new Date().toISOString().slice(11, 19); // HH:MM:SS
  return [`%c[${ts}]%c ${tag ? `[${tag}] ` : ""}`, "color:gray;", "color:inherit;", ...args];
}

function _out(kind, tag, args) {
  if (!enabled()) return;
  const fn = console[kind] || console.log;
  fn(...fmt(tag, args));
}

function ns(tag) {
  const w = (k) => (...args) => _out(k, tag, args);
  return {
    log: w("log"),
    info: w("info"),
    warn: w("warn"),
    error: w("error"),
    group: w("group"),
    groupEnd: () => enabled() && console.groupEnd(),
  };
}

export const dbg = {
  enabled,
  setEnabled,
  log: (...args) => _out("log", "", args),
  info: (...args) => _out("info", "", args),
  warn: (...args) => _out("warn", "", args),
  error: (...args) => _out("error", "", args),
  group: (...args) => _out("group", "", args),
  groupEnd: () => enabled() && console.groupEnd(),
  ns,
};

if (typeof window !== "undefined") {
  // Quick manual toggle in console: __dbg.setEnabled(true/false)
  window.__dbg = dbg;
}

export default dbg;
