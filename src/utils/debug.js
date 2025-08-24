// src/utils/debug.js
const STORE_KEY = "savva_debug_enabled";

const state = {
  enabled: (() => { try { return localStorage.getItem(STORE_KEY) === "1"; } catch { return false; } })(),
};

function logWithScope(method, scope, args) {
  if (!state.enabled) return;
  const c = console[method] || console.log;
  c.call(console, `${scope}:`, ...args);
}

export const dbg = {
  enable(on = true) {
    state.enabled = !!on;
    try { localStorage.setItem(STORE_KEY, state.enabled ? "1" : "0"); } catch {}
    return state.enabled;
  },
  enabled: () => !!state.enabled,

  log(scope, ...args)  { logWithScope("log", scope, args); },
  info(scope, ...args) { logWithScope("info", scope, args); },
  warn(scope, ...args) { logWithScope("warn", scope, args); },
  error(scope, ...args){ logWithScope("error", scope, args); },

  group(label) {
    if (state.enabled && console.groupCollapsed) console.groupCollapsed(label);
  },
  groupEnd() {
    if (state.enabled && console.groupEnd) console.groupEnd();
  },
};

export default dbg;