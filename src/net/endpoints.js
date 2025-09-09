// src/net/endpoints.js
// Single source of truth. Configure once, zero-arg getters. Emits a CustomEvent on changes.

function ensureSlash(s) { return s.endsWith("/") ? s : s + "/"; }

let _backendHttpBase = "";
let _wsUrl = "";
let _domain = "";

function buildHttpBase(backendLink) {
  if (!backendLink) return "";
  const u = new URL(backendLink);
  u.pathname = ensureSlash(u.pathname || "/");
  return u.toString();
}

function buildWsUrl(backendBase, domain) {
  if (!backendBase) return "";
  const u = new URL(backendBase);
  const hasApi = (u.pathname || "/").toLowerCase().includes("/api/");
  const wsPath = hasApi ? "ws" : "api/ws";
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = ensureSlash(u.pathname || "/") + wsPath;

  // Only domain as query — no lang.
  const q = new URLSearchParams(u.search);
  if (domain) q.set("domain", String(domain));
  u.search = q.toString() ? `?${q.toString()}` : "";
  return u.toString();
}

function notify() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("savva:endpoints-updated", {
        detail: { httpBase: _backendHttpBase, wsUrl: _wsUrl, domain: _domain },
      })
    );
  }
}

/** Configure once per backend/domain switch (idempotent) */
export function configureEndpoints({ backendLink, domain }) {
  const nextDomain = domain || "";
  const nextHttpBase = buildHttpBase(backendLink || "");
  const nextWsUrl   = buildWsUrl(nextHttpBase, nextDomain);

  const noChange = (nextDomain === _domain) &&
                   (nextHttpBase === _backendHttpBase) &&
                   (nextWsUrl === _wsUrl);
  if (noChange) return; // prevent unnecessary reconnects

  _domain = nextDomain;
  _backendHttpBase = nextHttpBase;
  _wsUrl = nextWsUrl;
  notify();
}

export function httpBase()        { return _backendHttpBase; }
export function wsUrl()           { return _wsUrl; }
export function currentDomain()   { return _domain; }
