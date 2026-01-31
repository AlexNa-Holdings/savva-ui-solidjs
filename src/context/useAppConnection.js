// src/context/useAppConnection.js
import { createSignal, onMount } from "solid-js";
import { parse } from "yaml";
import { configureEndpoints } from "../net/endpoints.js";
import { pushErrorToast } from "../ui/toast.js";
import { dbg } from "../utils/debug.js";

function ensureSlash(s) { return s ? (s.endsWith("/") ? s : s + "/") : ""; }
const OVERRIDE_KEY = "connect_override";

function pickPersistable(cfg) {
  if (!cfg) return null;
  return {
    domain: cfg.domain || "",
    backendLink: ensureSlash(cfg.backendLink || ""),
  };
}
function loadOverride() {
  try { const raw = localStorage.getItem(OVERRIDE_KEY); if (!raw) return null; return pickPersistable(JSON.parse(raw)); } catch { return null; }
}
function saveOverride(obj) {
  try { if (!obj) localStorage.removeItem(OVERRIDE_KEY); else localStorage.setItem(OVERRIDE_KEY, JSON.stringify(pickPersistable(obj))); } catch {}
}

export function useAppConnection() {
  const [config, setConfig] = createSignal(null);
  const [info, setInfo] = createSignal(null);
  const [error, setError] = createSignal(null);
  const [loading, setLoading] = createSignal(true);

  async function fetchInfo(cfg) {
    const res = await fetch(ensureSlash(cfg.backendLink) + "info", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`/info failed: ${res.status}`);
    return await res.json();
  }

  // 1) endpoints → 2) /info
  async function applyConfig(nextCfg, reason = "applyConfig") {
    setConfig(nextCfg);
    configureEndpoints(
      { backendLink: nextCfg.backendLink, domain: nextCfg.domain || "" },
      reason
    );
    const data = await fetchInfo(nextCfg);
    setInfo(data);
    return data;
  }

  async function init() {
    setLoading(true);
    setError(null);
    dbg.log("AppConnection", "init: start");

    try {
      const res = await fetch("/default_connect.yaml", { cache: "no-store" });
      dbg.log("AppConnection", "init: fetched /default_connect.yaml", { status: res.status });
      if (!res.ok) throw new Error(`YAML load failed: ${res.status}`);

      const yaml = parse(await res.text()) || {};
      dbg.log("AppConnection", "init: parsed YAML", yaml);

      // Support both legacy format (backendLink) and new multi-chain format (chains array)
      let backendLink = yaml.backendLink;
      if (!backendLink && Array.isArray(yaml.chains) && yaml.chains.length > 0) {
        // New format: use the first chain's rpc as backendLink
        backendLink = yaml.chains[0].rpc;
        dbg.log("AppConnection", "init: using first chain rpc as backendLink", { rpc: backendLink });
      }

      if (!backendLink) throw new Error("Missing backendLink or chains in config");

      const baseCfg = {
        domain: yaml.domain || "",
        backendLink: ensureSlash(backendLink),
        gear: !!yaml.gear,
        devMode: !!yaml.devMode,
        chains: yaml.chains || null, // Store chains for future use
      };
      const override = loadOverride();
      if (override) dbg.log("AppConnection", "init: found override", override);

      const merged = { ...baseCfg, ...override };
      dbg.log("AppConnection", "init: applying merged config", merged);

      await applyConfig(merged, "init");
    } catch (e) {
      setError(e);
      pushErrorToast(e, { op: "init" });
    } finally {
      setLoading(false);
      dbg.log("AppConnection", "init: done");
    }
  }

  onMount(init);

  // For “Switch backend” dialog or programmatic changes.
  async function updateConnect(partial) {
    dbg.log("AppConnection", "updateConnect");
    setLoading(true);
    setError(null);
    try {
      const cur = config() || {};
      const next = {
        ...cur,
        ...partial,
        backendLink: ensureSlash(partial?.backendLink ?? cur.backendLink),
      };

      const backendChanged = next.backendLink !== cur.backendLink;
      const domainChanged = String(next.domain || "").trim() !== String(cur.domain || "").trim();

      if (backendChanged) {
        await applyConfig(next, "updateConnect:backend-changed");
      } else if (domainChanged) {
        setConfig(next);
        configureEndpoints(
          { backendLink: next.backendLink, domain: next.domain || "" },
          "updateConnect:domain-changed"
        );
      } else {
        dbg.log("AppConnection", "updateConnect noop", next);
      }

      saveOverride(next);
    } catch (e) {
      setError(e);
      pushErrorToast(e, { op: "updateConnect" });
    } finally {
      setLoading(false);
    }
  }

  // For quick domain flips (does NOT touch backend; WS will idempotently no-op if unchanged).
  function setDomain(nextDomain) {
    const cur = config() || {};
    const next = { ...cur, domain: nextDomain || "" };
    setConfig(next);
    saveOverride(next);
    configureEndpoints(
      { backendLink: next.backendLink, domain: next.domain || "" },
      "setDomain"
    );
  }

  async function clearConnectOverride() {
    dbg.log("AppConnection", "clearConnectOverride");
    saveOverride(null);
    await init();
  }

  return { config, info, error, loading, init, updateConnect, clearConnectOverride, setDomain };
}
