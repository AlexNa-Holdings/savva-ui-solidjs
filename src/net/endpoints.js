// File: src/net/endpoints.js
// Single source of truth. Configure once, then use zero-arg getters.

function ensureSlash(s) { return s.endsWith("/") ? s : s + "/"; }

let _backendHttpBase = "";   // e.g. "https://ui.savva.app/api/"
let _wsUrl = "";             // e.g. "wss://ui.savva.app/api/ws?domain=...&lang=..."
let _domain = "";
let _lang = "en";

/** Internal builders (pure) */
function buildHttpBase(backendLink) {
  if (!backendLink) return "";
  const u = new URL(backendLink);
  u.pathname = ensureSlash(u.pathname || "/");
  return u.toString();
}
function buildWsUrl(backendLink, domain, lang) {
  if (!backendLink) return "";
  const u = new URL(backendLink);
  const basePath = u.pathname || "/";
  const hasApi = basePath.toLowerCase().includes("/api/");
  const wsPath = hasApi ? "ws" : "api/ws";
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = ensureSlash(basePath) + wsPath;

  const q = new URLSearchParams(u.search);
  if (domain) q.set("domain", String(domain));
  if (lang)   q.set("lang", String(lang));
  u.search = q.toString() ? `?${q.toString()}` : "";
  return u.toString();
}

/**
 * Configure once when backend/domain/lang are known.
 * Call this from boot (useConnect) and whenever user switches backend/domain.
 */
export function configureEndpoints({ backendLink, domain, lang = "en" }) {
  _domain = domain || "";
  _lang = lang || "en";
  _backendHttpBase = buildHttpBase(backendLink || "");
  _wsUrl = buildWsUrl(_backendHttpBase, _domain, _lang);
}

/** Zero-arg getters used everywhere */
export function httpBase() { return _backendHttpBase; }
export function wsUrl()    { return _wsUrl; }
export function currentDomain() { return _domain; }
export function currentLang()   { return _lang; }
