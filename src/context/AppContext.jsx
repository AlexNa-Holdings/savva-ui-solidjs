// src/context/AppContext.jsx
import { createContext, useContext, createSignal, onMount, createMemo } from "solid-js";
import { parse } from "yaml";
import { getChainMeta } from "../blockchain/chains";          // <-- relative import
import { switchOrAddChain } from "../blockchain/wallet";       // <-- relative import

const AppContext = createContext();

const OVERRIDE_KEY = "connect_override_v1";

function ensureSlash(s) {
  if (!s) return "";
  return s.endsWith("/") ? s : s + "/";
}

function pickPersistable(cfg) {
  if (!cfg) return null;
  return {
    domain: cfg.domain || "",
    backendLink: ensureSlash(cfg.backendLink || "")
  };
}

function loadOverride() {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return pickPersistable(obj);
  } catch { return null; }
}

function saveOverride(obj) {
  try {
    if (!obj) localStorage.removeItem(OVERRIDE_KEY);
    else localStorage.setItem(OVERRIDE_KEY, JSON.stringify(pickPersistable(obj)));
  } catch {}
}

export function AppProvider(props) {
  const [config, setConfig] = createSignal(null);
  const [info, setInfo] = createSignal(null);          // /info payload
  const [error, setError] = createSignal(null);
  const [loading, setLoading] = createSignal(true);
  const [lastUpdatedAt, setLastUpdatedAt] = createSignal(null);

  async function fetchInfo(cfg) {
    const res = await fetch(cfg.backendLink + "info", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`/info failed: ${res.status}`);
    return await res.json();
  }

  async function applyConfig(nextCfg) {
    setConfig(nextCfg);
    const data = await fetchInfo(nextCfg);
    setInfo(data);                         // store /info in context
    setLastUpdatedAt(Date.now());
  }

  async function init() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/default_connect.yaml", { cache: "no-store" });
      if (!res.ok) throw new Error(`YAML load failed: ${res.status}`);
      const text = await res.text();
      const data = parse(text) || {};
      if (!data.backendLink) throw new Error("Missing backendLink in config");

      const baseCfg = {
        domain: data.domain || "",
        backendLink: ensureSlash(data.backendLink),
        gear: !!data.gear,
      };

      const ovr = loadOverride();
      const merged = { ...baseCfg, ...(ovr ? { ...ovr } : {}) };

      await applyConfig(merged);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  // Change backend and/or domain
  async function updateConnect(partial) {
    try {
      setLoading(true);
      setError(null);
      const cur = config() || {};
      const next = {
        ...cur,
        ...partial,
        backendLink: ensureSlash(partial?.backendLink ?? cur.backendLink),
      };

      const backendChanged = next.backendLink !== cur.backendLink;
      if (backendChanged) {
        await applyConfig(next);
      } else {
        setConfig(next);
        setLastUpdatedAt(Date.now());
      }

      saveOverride(next);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  function setDomain(nextDomain) {
    const cur = config() || {};
    const next = { ...cur, domain: nextDomain || "" };
    setConfig(next);
    saveOverride(next);
    setLastUpdatedAt(Date.now());
  }

  async function clearConnectOverride() {
    saveOverride(null);
    await init();
  }

  onMount(init);

  // Derived helpers
  const supportedDomains = createMemo(() => {
    const data = info();
    const list = Array.isArray(data?.domains) ? data.domains : [];
    return list
      .map((d) => (typeof d === "string" ? d : d?.name))
      .filter((name) => typeof name === "string" && name.trim().length > 0);
  });

  const selectedDomain = createMemo(() => {
    const data = info();
    const cur = config();
    if (!data || !cur) return null;
    const list = Array.isArray(data.domains) ? data.domains : [];
    return list.find((d) => (typeof d === "string" ? d === cur.domain : d?.name === cur.domain)) || null;
  });

  const desiredChainId = createMemo(() => {
    const id = info()?.blockchain_id;
    return typeof id === "number" ? id : null;
  });

  const desiredChain = createMemo(() => {
    const id = desiredChainId();
    return id ? getChainMeta(id) : null;
  });

  async function ensureWalletOnDesiredChain() {
    const meta = desiredChain();
    if (!meta) throw new Error("Unknown target chain");
    await switchOrAddChain(meta);
  }

  const value = {
    // state
    config,
    info,
    error,
    loading,
    lastUpdatedAt,

    // convenience
    supportedDomains,
    selectedDomain,
    desiredChainId,
    desiredChain,

    // actions
    reload: init,
    updateConnect,
    clearConnectOverride,
    setDomain,
    ensureWalletOnDesiredChain,
  };

  return <AppContext.Provider value={value}>{props.children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
