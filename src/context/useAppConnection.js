// src/context/useAppConnection.js
import { createSignal, onMount } from "solid-js";
import { parse } from "yaml";
import { configureEndpoints } from "../net/endpoints";
import { pushErrorToast } from "../ui/toast.js";

function ensureSlash(s) { return s.endsWith("/") ? s : s + "/"; }
const OVERRIDE_KEY = "connect_override";

function pickPersistable(cfg) { if (!cfg) return null; return { domain: cfg.domain || "", backendLink: ensureSlash(cfg.backendLink || "") }; }
function loadOverride() { try { const raw = localStorage.getItem(OVERRIDE_KEY); if (!raw) return null; return pickPersistable(JSON.parse(raw)); } catch { return null; } }
function saveOverride(obj) { try { if (!obj) localStorage.removeItem(OVERRIDE_KEY); else localStorage.setItem(OVERRIDE_KEY, JSON.stringify(pickPersistable(obj))); } catch { } }

export function useAppConnection() {
  const [config, setConfig] = createSignal(null);
  const [info, setInfo] = createSignal(null);
  const [error, setError] = createSignal(null);
  const [loading, setLoading] = createSignal(true);

  async function fetchInfo(cfg) {
    const res = await fetch(cfg.backendLink + "info", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`/info failed: ${res.status}`);
    return await res.json();
  }

  async function applyConfig(nextCfg) {
    setConfig(nextCfg);

    // 1) Establish single source of truth first (HTTP base + WS URL).
    configureEndpoints({ backendLink: nextCfg.backendLink, domain: nextCfg.domain || "" });

    // 2) Then fetch /info to drive the rest of the app.
    const data = await fetchInfo(nextCfg);
    setInfo(data);
  }

  async function init() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/default_connect.yaml", { cache: "no-store" });
      if (!res.ok) throw new Error(`YAML load failed: ${res.status}`);
      const data = parse(await res.text()) || {};
      if (!data.backendLink) throw new Error("Missing backendLink in config");

      const baseCfg = { domain: data.domain || "", backendLink: ensureSlash(data.backendLink), gear: !!data.gear };
      const merged = { ...baseCfg, ...loadOverride() };
      await applyConfig(merged);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  onMount(init);

  async function updateConnect(partial) {
    try {
      setLoading(true); setError(null);
      const cur = config() || {};
      const next = { ...cur, ...partial, backendLink: ensureSlash(partial?.backendLink ?? cur.backendLink) };

      // If backend changes, fully apply (endpoints first -> /info).
      if (next.backendLink !== cur.backendLink) {
        await applyConfig(next);
      } else {
        // Domain-only change: set state and (idempotent) reconfigure endpoints.
        setConfig(next);
        configureEndpoints({ backendLink: next.backendLink, domain: next.domain || "" });
      }
      saveOverride(next);
    } catch (e) {
      setError(e);
      pushErrorToast(e, { op: "updateConnect" });
    } finally {wsCon
      setLoading(false);
    }
  }

  function setDomain(nextDomain) {
    const cur = config() || {};
    const next = { ...cur, domain: nextDomain || "" };
    setConfig(next);
    saveOverride(next);
    configureEndpoints({ backendLink: next.backendLink, domain: next.domain || "" });
  }

  async function clearConnectOverride() {
    saveOverride(null);
    await init();
  }

  return { config, info, error, loading, init, updateConnect, clearConnectOverride, setDomain };
}
