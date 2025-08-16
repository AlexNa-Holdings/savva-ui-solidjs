// src/context/AppContext.jsx
import { createContext, useContext, createSignal, onMount, createMemo, onCleanup, createEffect } from "solid-js";
import { parse } from "yaml";
import { getChainMeta } from "../blockchain/chains";
import { switchOrAddChain } from "../blockchain/wallet";
import { pushToast, pushErrorToast } from "../ux/toast";
import { useI18n } from "../i18n/useI18n";
import { fetchWithTimeout } from "../utils/net.js";

// ───────────────────────────────────────────────────────────────────────────────
// small string utils (local)
// ───────────────────────────────────────────────────────────────────────────────
function ensureSlash(s) { if (!s) return ""; return s.endsWith("/") ? s : s + "/"; }
function trimSlash(s) { if (!s) return ""; return s.endsWith("/") ? s.slice(0, -1) : s; }
const dn = (d) => (typeof d === "string" ? d : d?.name || "");
const eq = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

// ---------- context ----------
const AppContext = createContext();
const OVERRIDE_KEY = "connect_override_v1";
const IPFS_LOCAL_KEY = "ipfs_local_enabled_v1";
const IPFS_LOCAL_API_KEY = "ipfs_local_api_v1";
const IPFS_LOCAL_GATEWAY_KEY = "ipfs_local_gateway_v1";
const DEFAULT_DOMAIN_ASSETS_PREFIX = "/domain_default/";

// domain assets env persistence key
const ASSETS_ENV_KEY = "domain_assets_env_v1"; // "prod" | "test"

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
    return pickPersistable(JSON.parse(raw));
  } catch {
    return null;
  }
}
function saveOverride(obj) {
  try {
    if (!obj) localStorage.removeItem(OVERRIDE_KEY);
    else localStorage.setItem(OVERRIDE_KEY, JSON.stringify(pickPersistable(obj)));
  } catch {}
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

  // domain assets env (prod/test)
  const [assetsEnv, setAssetsEnvState] = createSignal(localStorage.getItem(ASSETS_ENV_KEY) || "prod");
  function setAssetsEnv(next) {
    const v = next === "test" ? "test" : "prod";
    localStorage.setItem(ASSETS_ENV_KEY, v);
    setAssetsEnvState(v);
  }

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
    // 🔔 Make the error visible globally (dialog may close after Apply)
    pushErrorToast(e, {
      op: "updateConnect",
      backendLink: partial?.backendLink ?? cur?.backendLink,
      domain: partial?.domain ?? cur?.domain,
    });
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
    return list
      .map((d) => (typeof d === "string" ? d : d?.name))
      .filter((name) => typeof name === "string" && name.trim().length > 0);
  });

  // ✅ Single source of truth for domain:
  // Prefer explicit config().domain, even if /info hasn't listed it yet.
  const selectedDomain = createMemo(() => {
    const curDomain = (config()?.domain || "").trim();
    const list = Array.isArray(info()?.domains) ? info().domains : [];
    if (curDomain) {
      const found = list.find((d) => eq(dn(d), curDomain));
      return found ? (typeof found === "string" ? { name: found } : found) : { name: curDomain };
    }
    const first = list[0];
    return typeof first === "string" ? { name: first } : first || null;
  });

  const selectedDomainName = createMemo(() => dn(selectedDomain()) || "");

  const desiredChainId = createMemo(() =>
    typeof info()?.blockchain_id === "number" ? info().blockchain_id : null
  );
  const desiredChain = createMemo(() => {
    const id = desiredChainId();
    return id ? getChainMeta(id) : null;
  });
  async function ensureWalletOnDesiredChain() {
    const meta = desiredChain();
    if (!meta) throw new Error("Unknown target chain");
    await switchOrAddChain(meta);
  }

  const remoteIpfsGateways = createMemo(() => {
    const arr = info()?.ipfs_gateways;
    return Array.isArray(arr)
      ? arr
          .filter(Boolean)
          .map((s) => ensureSlash(s.trim()))
          .filter(Boolean)
      : [];
  });

  const activeIpfsGateways = createMemo(() => {
    // STRICT MODE: if local IPFS is enabled, use ONLY the local gateway
    if (localIpfsEnabled() && localIpfsGateway()) {
      return [ensureSlash(localIpfsGateway())];
    }
    // otherwise use the remote list from /info
    return remoteIpfsGateways();
  });

  // ----- Domain assets (prod/test) -----

  // Base assets URL from /info based on selected env
  const assetsBaseUrl = createMemo(() => {
    const i = info();
    if (!i) return "";
    const raw = assetsEnv() === "test" ? i?.temp_assets_url : i?.assets_url;
    return ensureSlash(raw || "");
  });

  // Prefix like <assetsBase>/<domain>/
  const domainAssetsPrefix = createMemo(() => {
    const base = assetsBaseUrl();
    const dom  = selectedDomainName();
    if (!base || !dom) return "";
    return ensureSlash(base) + dom.replace(/^\//, "") + "/";
  });

  // State for parsed config.yaml (+source/prefix so consumers know what we use)
  const [domainAssetsState, setDomainAssetsState] = createSignal({
    config: null,
    loadedAt: null,
    error: null,
    source: null, // "remote" | "default"
    prefix: DEFAULT_DOMAIN_ASSETS_PREFIX, // active base for assetUrl()
  });

  // Helper: load & parse the default pack config so components (BrandLogo, etc.)
  // can still read logos/locales when there is no per-domain config.
  // Now stamp-aware and non-clobbering by default.
  async function loadDefaultAssetsConfig(fallbackError, { stamp, force = false } = {}) {
    try {
      // If a newer refresh started, bail
      if (stamp && stamp !== assetsLoadSeq) return;

      // Unless explicitly forced (real failure/new domain), never clobber
      // an already active remote pack with the default pack during transient states.
      if (!force && domainAssetsState().source === "remote") return;

      const res = await fetchWithTimeout(`${DEFAULT_DOMAIN_ASSETS_PREFIX}config.yaml`, { timeoutMs: 8000 });
      let parsed = null;
      if (res.ok) {
        const text = await res.text();
        try { parsed = parse(text) || null; } catch { parsed = null; }
      }

      // Recheck staleness again right before committing
      if (stamp && stamp !== assetsLoadSeq) return;

      setDomainAssetsState({
        config: parsed,
        loadedAt: new Date(),
        error: null,
        source: "default",
        prefix: DEFAULT_DOMAIN_ASSETS_PREFIX,
      });
    } catch (e) {
      if (stamp && stamp !== assetsLoadSeq) return;
      setDomainAssetsState({
        config: null,
        loadedAt: new Date(),
        error: fallbackError || e,
        source: "default",
        prefix: DEFAULT_DOMAIN_ASSETS_PREFIX,
      });
    }
  }

  // ✅ Prevent stale loads from clobbering current domain pack
  let assetsLoadSeq = 0;

  // Loader for per-domain config with fallback to domain_default (parsed!)
  async function refreshDomainAssets() {
    const prefix = domainAssetsPrefix();
    const stamp  = ++assetsLoadSeq;

    // If we don't yet have a computed prefix (e.g., info/domain not resolved),
    // DO NOT clobber a good remote pack with default. Seed default only if nothing loaded.
    if (!prefix) {
      if (!domainAssetsState().source) {
        await loadDefaultAssetsConfig(undefined, { stamp, force: false });
      }
      return;
    }

    const url = `${prefix}config.yaml`;
    try {
      const res = await fetchWithTimeout(url, { timeoutMs: 8000 });

      // If this response is stale, ignore it
      if (stamp !== assetsLoadSeq) return;

      if (res.status === 404) {
        await loadDefaultAssetsConfig(new Error("404"), { stamp, force: true });
        return;
      }
      if (!res.ok) {
        await loadDefaultAssetsConfig(
          new Error(`Domain assets fetch failed: ${res.status} ${res.statusText}`),
          { stamp, force: true }
        );
        return;
      }

      const text = await res.text();
      let parsed = null;
      try {
        parsed = parse(text) || null;
      } catch (e) {
        await loadDefaultAssetsConfig(e, { stamp, force: true });
        return;
      }

      // Still current? Commit it.
      if (stamp !== assetsLoadSeq) return;
      setDomainAssetsState({
        config: parsed,
        loadedAt: new Date(),
        error: null,
        source: "remote",
        prefix, // ASSETS_BASE/<domain>/
      });
    } catch (e) {
      if (stamp !== assetsLoadSeq) return;
      await loadDefaultAssetsConfig(e, { stamp, force: true });
    }
  }

  
  // Resolve an asset path using the *active* prefix (domain or default)
  function assetUrl(relPath) {
    if (!relPath) return "";
    if (/^(https?:)?\/\//i.test(relPath) || /^data:/.test(relPath)) return relPath;
    const prefix = domainAssetsState().prefix || DEFAULT_DOMAIN_ASSETS_PREFIX;
    return prefix + String(relPath).replace(/^\//, "");
  }

  // Auto-refresh when env, info, or domain changes
  createEffect(() => {
    // track dependencies
    void assetsEnv();
    void assetsBaseUrl();
    void selectedDomainName();
    // fire loader
    void refreshDomainAssets();
  });

  const domainAssetsConfig = createMemo(() => domainAssetsState().config);
  const domainAssetsSource = createMemo(() => domainAssetsState().source || null);
  const domainAssetsPrefixActive = createMemo(
    () => domainAssetsState().prefix || DEFAULT_DOMAIN_ASSETS_PREFIX
  );

  // ----- Local IPFS: probe + monitor -----
  function multiaddrToHttp(ma) {
    if (typeof ma !== "string" || !ma.startsWith("/")) return ma;
    const parts = ma.split("/").filter(Boolean);
    let host = null, port = null;
    for (let i = 0; i < parts.length; i += 2) {
      const k = parts[i], v = parts[i + 1];
      if (k === "ip4" || k === "dns4" || k === "dns6") host = v;
      else if (k === "ip6") host = v && v.includes(":") ? `[${v}]` : v;
      else if (k === "tcp") port = v;
    }
    if (!host || !port) return ma;
    return `http://${host}:${port}/`;
  }

  function normalizeGatewayBase(g) {
    const base = g.startsWith("/") ? multiaddrToHttp(g) : g;
    return ensureSlash(base);
  }

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
    const httpGw = gw.startsWith("/") ? multiaddrToHttp(gw) : gw; // normalize
    return ensureSlash(httpGw);
  }

  function startLocalIpfsMonitor() {
    stopLocalIpfsMonitor();
    // first immediate ping (don’t spam toasts on the very first success)
    void pingLocalIpfs();
    ipfsMonitorTid = setInterval(pingLocalIpfs, 20000);
  }
  function stopLocalIpfsMonitor() {
    if (ipfsMonitorTid) {
      clearInterval(ipfsMonitorTid);
      ipfsMonitorTid = null;
    }
  }
  function disableLocalIpfs() {
    stopLocalIpfsMonitor();
    setLocalIpfsEnabled(false);
    setLocalIpfsGateway("");
    setLocalIpfsStatus("unknown");
    localStorage.setItem(IPFS_LOCAL_KEY, "0");
    localStorage.removeItem(IPFS_LOCAL_GATEWAY_KEY);
    pushToast({ type: "info", message: i18n.t("settings.ipfs.localDisabled") });
  }
  async function pingLocalIpfs() {
    try {
      const base = trimSlash(localIpfsApiUrl());
      if (!base) throw new Error("No API URL");
      const res = await fetchWithTimeout(`${base}/api/v0/id`, { method: "POST", timeoutMs: 5000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLocalIpfsStatus("ok");
      return true;
    } catch (e) {
      setLocalIpfsStatus("down");
      pushErrorToast(e, { op: "pingLocalIpfs", apiUrl: localIpfsApiUrl() });
      return false;
    }
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
    selectedDomain,           // object with {name,...} (or null)
    desiredChainId,
    desiredChain,
    remoteIpfsGateways,
    activeIpfsGateways,

    // domain assets
    assetsEnv,
    setAssetsEnv,
    assetsBaseUrl,
    domainAssetsConfig,
    domainAssetsSource,
    domainAssetsPrefix: domainAssetsPrefixActive,
    refreshDomainAssets,
    assetUrl,

    // actions
    reload: init,
    updateConnect,
    clearConnectOverride,
    setDomain,
    ensureWalletOnDesiredChain,

    // local IPFS actions
    enableLocalIpfs: async (apiUrl) => {
      try {
        const gw = await probeLocalIpfs(apiUrl);
        setLocalIpfsApiUrl(apiUrl);
        setLocalIpfsGateway(gw);
        setLocalIpfsEnabled(true);
        localStorage.setItem(IPFS_LOCAL_KEY, "1");
        localStorage.setItem(IPFS_LOCAL_API_KEY, apiUrl);
        localStorage.setItem(IPFS_LOCAL_GATEWAY_KEY, gw);
        startLocalIpfsMonitor();
      } catch (e) {
        pushErrorToast(e, { op: "enableLocalIpfs", apiUrl });
        throw e;
      }
    },
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
