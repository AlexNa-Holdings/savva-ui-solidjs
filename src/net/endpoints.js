// src/net/endpoints.js
import { createSignal } from "solid-js";
import { toWsUrl } from "./wsUrl.js";
import { dbg } from "../utils/debug.js";

function ensureSlash(s) { return s ? (s.endsWith("/") ? s : s + "/") : ""; }

const [base, setBase] = createSignal("");
const [dom, setDom] = createSignal("");

export function httpBase(override) {
  return ensureSlash(override ?? base());
}
export function currentDomain() {
  return dom();
}
export function wsUrl() {
  const b = base();
  if (!b) return "";
  const d = dom();
  return toWsUrl(b, { path: "/ws", query: d ? { domain: d } : {} });
}

/**
 * Idempotent: no events if nothing changed.
 * `reason` is shown in logs to trace accidental callers.
 */
export function configureEndpoints({ backendLink, domain } = {}, reason = "") {
  const next = {
    base: ensureSlash(backendLink || ""),
    domain: String(domain || "").trim(),
  };
  const prev = { base: base(), domain: dom() };

  if (prev.base === next.base && prev.domain === next.domain) {
    dbg.log("endpoints", "noop", { base: next.base, domain: next.domain, reason });
    return;
  }

  setBase(next.base);
  setDom(next.domain);

  const ws = wsUrl();
  dbg.log("endpoints", "updated", { prev, next, reason, ws });

  try {
    window.dispatchEvent(new CustomEvent("savva:endpoints-updated"));
  } catch {}
}
