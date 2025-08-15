import { createContext, useContext, createSignal, onMount, createMemo, onCleanup } from "solid-js";
import { parse } from "yaml";
import { getChainMeta } from "../blockchain/chains";
import { switchOrAddChain } from "../blockchain/wallet";
import { pushToast, pushErrorToast, errorDetails } from "../ux/toast";
import { useI18n } from "../i18n/useI18n";



// ---------- helpers ----------
function ensureSlash(s) { if (!s) return ""; return s.endsWith("/") ? s : s + "/"; }
function trimSlash(s) { return (s || "").replace(/\/+$/g, ""); }
async function fetchWithTimeout(url, { timeoutMs = 7000, method = "GET", headers, signal, body } = {}) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), timeoutMs);
  if (signal) signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  try {
    const res = await fetch(url, { method, headers, body, signal: controller.signal, cache: "no-store" });
    return res;
  } finally {
    clearTimeout(tid);
  }
}

// ---------- context ----------
const AppContext = createContext();
const OVERRIDE_KEY = "connect_override_v1";
const IPFS_LOCAL_KEY = "ipfs_local_enabled_v1";
const IPFS_LOCAL_API_KEY = "ipfs_local_api_v1";
const IPFS_LOCAL_GATEWAY_KEY = "ipfs_local_gateway_v1";

function pickPersistable(cfg) {
  if (!cfg) return null;
  return {
    domain: cfg.domain || "",
    backendLink: ensureSlash(cfg.backendLink || "")
  };
}

function loadOverride() {
  try { const raw = localStorage.getItem(OVERRIDE_KEY); if (!raw) return null; return pickPersistable(JSON.parse(raw)); } catch { return null; }
}
function saveOverride(obj) {
  try { if (!obj) localStorage.removeItem(OVERRIDE_KEY); else localStorage.setItem(OVERRIDE_KEY, JSON.stringify(pickPersistable(obj))); } catch { }
}

export function AppProvider(props) {
  const i18n = useI18n();
  const [config, setConfig] = createSignal(null);
  const [info, setInfo] = createSignal(null);
  const [error, setError] = createSignal(null);
  const [loading, setLoading] = createSignal(true);
  const [lastUpdatedAt, setLastUpdatedAt] = createSignal(null);

  // Local IPFS prefs/state
  const [localIpfsEnabled, setLocalIpfsEnabled] = createSignal(localStorage.getItem(IPFS_LOCAL_KEY) === "1");
  const [localIpfsApiUrl, setLocalIpfsApiUrl] = createSignal(localStorage.getItem(IPFS_LOCAL_API_KEY) || "http://localhost:5001");
  const [localIpfsGateway, setLocalIpfsGateway] = createSignal(localStorage.getItem(IPFS_LOCAL_GATEWAY_KEY) || "");
  const [localIpfsStatus, setLocalIpfsStatus] = createSignal("unknown"); // "unknown" | "ok" | "down"
  let ipfsMonitorTid = null;

  async function fetchInfo(cfg) {
    const res = await fetch(cfg.backendLink + "info", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`/info failed: ${res.status}`);
    return await res.json();
  }

  async function applyConfig(nextCfg) {
    setConfig(nextCfg);
    const data = await fetchInfo(nextCfg);
    setInfo(data);
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

      // kick off local IPFS monitor if enabled
      if (localIpfsEnabled() && localIpfsApiUrl()) startLocalIpfsMonitor();
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  // ----- Connect changes -----
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
  onCleanup(() => stopLocalIpfsMonitor());

  // ----- Derived helpers from /info -----
  const supportedDomains = createMemo(() => {
    const data = info();
    const list = Array.isArray(data?.domains) ? data.domains : [];
    return list.map((d) => (typeof d === "string" ? d : d?.name)).filter((name) => typeof name === "string" && name.trim().length > 0);
  });

  const selectedDomain = createMemo(() => {
    const data = info();
    const cur = config();
    if (!data || !cur) return null;
    const list = Array.isArray(data.domains) ? data.domains : [];
    return list.find((d) => (typeof d === "string" ? d === cur.domain : d?.name === cur.domain)) || null;
  });

  const desiredChainId = createMemo(() => (typeof info()?.blockchain_id === "number" ? info().blockchain_id : null));
  const desiredChain = createMemo(() => { const id = desiredChainId(); return id ? getChainMeta(id) : null; });
  async function ensureWalletOnDesiredChain() {
    const meta = desiredChain();
    if (!meta) throw new Error("Unknown target chain");
    await switchOrAddChain(meta);
  }

  const remoteIpfsGateways = createMemo(() => {
    const arr = info()?.ipfs_gateways;
    return Array.isArray(arr) ? arr.filter(Boolean).map((s) => ensureSlash(s.trim())).filter(Boolean) : [];
  });

  const activeIpfsGateways = createMemo(() => {
    if (localIpfsEnabled() && localIpfsGateway()) {
      return [ensureSlash(localIpfsGateway()), ...remoteIpfsGateways()];
    }
    return remoteIpfsGateways();
  });

  // ----- Local IPFS: probe + monitor -----
  async function probeLocalIpfs(apiUrl) {
    const base = trimSlash(apiUrl || "");
    if (!base) throw new Error("Local IPFS API URL is empty");
    // CORS note: browser needs CORS on local node
    const url = `${base}/api/v0/config/show`;
    const res = await fetchWithTimeout(url, { method: "POST", timeoutMs: 7000 });
    if (!res.ok) throw new Error(`IPFS RPC error: ${res.status}`);
    const cfg = await res.json();
    let gw = cfg?.Addresses?.Gateway || cfg?.Addresses?.["Gateway"];
    if (!gw || typeof gw !== "string") throw new Error("Gateway not found in IPFS config");
    return ensureSlash(gw);
  }

  async function enableLocalIpfs(apiUrl) {
    try {
      const gw = await probeLocalIpfs(apiUrl);
      setLocalIpfsEnabled(true);
      setLocalIpfsApiUrl(apiUrl);
      setLocalIpfsGateway(gw);
      localStorage.setItem(IPFS_LOCAL_KEY, "1");
      localStorage.setItem(IPFS_LOCAL_API_KEY, apiUrl);
      localStorage.setItem(IPFS_LOCAL_GATEWAY_KEY, gw);
      setLocalIpfsStatus("ok");
      pushToast({ type: "success", message: `Local IPFS enabled. Gateway: ${gw}` });
      startLocalIpfsMonitor();
      return gw;
    } catch (e) {
      setLocalIpfsEnabled(false);
      setLocalIpfsStatus("down");
      pushErrorToast(e, { op: "enableLocalIpfs", apiUrl });
      throw e;
    }
  }

  function disableLocalIpfs() {
    stopLocalIpfsMonitor();
    setLocalIpfsEnabled(false);
    setLocalIpfsGateway("");
    setLocalIpfsStatus("unknown");
    localStorage.setItem(IPFS_LOCAL_KEY, "0");
    localStorage.removeItem(IPFS_LOCAL_GATEWAY_KEY);
    pushToast({ type: "info", message: "Local IPFS disabled" });
  }

  async function pingLocalIpfs() {
    try {
      const base = trimSlash(localIpfsApiUrl());
      if (!base) throw new Error("No API URL");
      const res = await fetchWithTimeout(`${base}/api/v0/id`, { method: "POST", timeoutMs: 5000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLocalIpfsStatus("ok");
      return true;
    } catch (e) {                      // <-- add (e)
      setLocalIpfsStatus("down");
      pushErrorToast(e, { op: "pingLocalIpfs", apiUrl: localIpfsApiUrl() });
      return false;
    }
  }

  function startLocalIpfsMonitor() {
    stopLocalIpfsMonitor();
    // first immediate ping (don’t spam toasts on the very first success)
    pingLocalIpfs();
    ipfsMonitorTid = setInterval(pingLocalIpfs, 20000);
  }
  function stopLocalIpfsMonitor() {
    if (ipfsMonitorTid) { clearInterval(ipfsMonitorTid); ipfsMonitorTid = null; }
  }

  const value = {
    // state
    config, info, error, loading, lastUpdatedAt,

    // preferences/state: local IPFS
    localIpfsEnabled,
    localIpfsApiUrl,
    localIpfsGateway,
    localIpfsStatus,

    // convenience
    supportedDomains,
    selectedDomain,
    desiredChainId,
    desiredChain,
    remoteIpfsGateways,
    activeIpfsGateways,

    // actions
    reload: init,
    updateConnect,
    clearConnectOverride,
    setDomain,
    ensureWalletOnDesiredChain,

    // local IPFS actions
    enableLocalIpfs,
    disableLocalIpfs,
    setLocalIpfsApiUrl, // so Settings can update the URL field live

    // i18n (now globally available through AppContext)
    t: i18n.t,
    lang: i18n.lang,
    setLang: i18n.setLang,
    showKeys: i18n.showKeys,
    setShowKeys: i18n.setShowKeys,
    i18nAvailable: i18n.available,
  };

  return <AppContext.Provider value={value}>{props.children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
