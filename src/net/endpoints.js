// src/net/endpoints.js
import { dbg } from "../utils/debug.js";

let _backendHttpBase = "";
let _wsUrl = "";
let _domain = "";

const ensureTrailingSlash = (s) => (s.endsWith("/") ? s : s + "/");

function buildHttpBase(backendLink) {
  const v = String(backendLink || "").trim();
  if (!v) return "/api/";
  if (v.startsWith("http://") || v.startsWith("https://")) {
    return ensureTrailingSlash(new URL(v).toString());
  }
  return ensureTrailingSlash(v);
}

function buildWsUrl(httpBase, domain) {
  try {
    if (!httpBase) return "";
    const u = new URL(httpBase, typeof window !== "undefined" ? window.location.href : "http://localhost/");
    const proto = u.protocol === "https:" ? "wss:" : "ws:";
    const host = u.host;
    return `${proto}//${host}/api/ws?domain=${encodeURIComponent(domain || "")}`;
  } catch {
    return "";
  }
}

function notify(next) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("savva:endpoints-updated", { detail: next }));
  }
}

export function configureEndpoints({ backendLink, domain }) {
  const prev = { httpBase: _backendHttpBase, wsUrl: _wsUrl, domain: _domain };

  const nextDomain = String(domain || "").trim();
  const nextHttpBase = buildHttpBase(backendLink);
  const nextWsUrl = buildWsUrl(nextHttpBase, nextDomain);

  const same =
    prev.domain === nextDomain &&
    prev.httpBase === nextHttpBase &&
    prev.wsUrl === nextWsUrl;

  dbg.group("endpoints", "configureEndpoints()", {
    prev,
    next: { httpBase: nextHttpBase, wsUrl: nextWsUrl, domain: nextDomain },
    same,
  });
  try { console.trace("endpoints: configureEndpoints call stack"); } catch {}

  if (same) {
    dbg.log("endpoints", "→ no change (skip notify)");
    dbg.groupEnd();
    return;
  }

  _domain = nextDomain;
  _backendHttpBase = nextHttpBase;
  _wsUrl = nextWsUrl;

  notify({ httpBase: _backendHttpBase, wsUrl: _wsUrl, domain: _domain });
  dbg.log("endpoints", "→ dispatched 'savva:endpoints-updated'");
  dbg.groupEnd();
}

export function httpBase() {
  return _backendHttpBase;
}
export function wsUrl() {
  return _wsUrl;
}
export function currentDomain() {
  return _domain;
}
