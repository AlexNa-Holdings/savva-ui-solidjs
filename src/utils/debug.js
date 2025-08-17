// src/utils/debug.js
/* src/utils/debug.js */
const STORE_KEY = "savva_debug_enabled";
const MAX_LINES = 4000;

function nowStamp() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function safeStr(x) {
  if (x instanceof Error) return `${x.name}: ${x.message}`;
  if (typeof x === "string") return x;
  try { return JSON.stringify(x, null, 2); } catch { return String(x); }
}

const state = {
  enabled: (() => { try { return localStorage.getItem(STORE_KEY) === "1"; } catch { return false; } })(),
  indent: 0,
  lines: [],
  listeners: new Set(),
};

function push(kind, scope, parts) {
  const pad = "  ".repeat(Math.max(0, state.indent));
  const text = `[${nowStamp()}]  ${pad}${scope}${parts.length ? " " + parts.map(safeStr).join(" ") : ""}`;
  state.lines.push(text);
  if (state.lines.length > MAX_LINES) state.lines.splice(0, state.lines.length - MAX_LINES);
  state.listeners.forEach((fn) => { try { fn(text, kind, scope); } catch {} });
  // mirror to console when enabled
  if (state.enabled) {
    const c = console[kind] || console.log;
    c.call(console, `${scope}:`, ...parts);
  }
}

export const dbg = {
  // enable/disable + both property-style and method-style accessors
  enable(on = true) {
    state.enabled = !!on;
    try { localStorage.setItem(STORE_KEY, state.enabled ? "1" : "0"); } catch {}
    return state.enabled;
  },
  enabled() { return !!state.enabled; },     // method, for call-sites that do dbg.enabled()
  get isEnabled() { return !!state.enabled; },// getter, in case someone reads dbg.isEnabled

  // core logging
  log(scope, ...args)  { push("log", scope, args); },
  info(scope, ...args) { push("info", scope, args); },
  warn(scope, ...args) { push("warn", scope, args); },
  error(scope, ...args){ push("error", scope, args); },

  // groups (safe even if console.group* is missing)
  group(label) {
    push("log", "▶", [label]);
    if (state.enabled && console.groupCollapsed) console.groupCollapsed(label);
    state.indent++;
  },
  groupEnd() {
    state.indent = Math.max(0, state.indent - 1);
    if (state.enabled && console.groupEnd) console.groupEnd();
  },

  // listeners
  onChange(fn) { state.listeners.add(fn); return () => state.listeners.delete(fn); },

  // buffer ops
  clear() { state.lines = []; },
  entries() { return state.lines.slice(); },

  // text dump helpers used by the UI
  getText() { return state.lines.join("\n"); },
  text()    { return state.lines.join("\n"); }, // backwards compat
  async copy() {
    try { await navigator.clipboard.writeText(this.getText()); return true; }
    catch { return false; }
  },
};

export default dbg;
