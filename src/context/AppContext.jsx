// File: src/context/AppContext.jsx
import * as Solid from "solid-js";
import { parse } from "yaml";
import { getChainMeta } from "../blockchain/chains";
import { switchOrAddChain } from "../blockchain/wallet";
import { pushToast, pushErrorToast } from "../components/ui/toast.js";
import { useI18n } from "../i18n/useI18n";
import { fetchWithTimeout } from "../utils/net.js";
import { configureEndpoints } from "../net/endpoints";

// ───────────────────────────────────────────────────────────────────────────────
// small string utils (local)
// ───────────────────────────────────────────────────────────────────────────────
function ensureSlash(s) { if (!s) return ""; return s.endsWith("/") ? s : s + "/"; }
function trimSlash(s) { if (!s) return ""; return s.endsWith("/") ? s.slice(0, -1) : s; }
const dn = (d) => (typeof d === "string" ? d : d?.name || "");
const eq = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

// ---------- context ----------
const AppContext = Solid.createContext();
const OVERRIDE_KEY = "connect_override_v1";
const IPFS_LOCAL_KEY = "ipfs_local_enabled_v1";
const IPFS_LOCAL_API_KEY = "ipfs_local_api_v1";
const IPFS_LOCAL_GATEWAY_KEY = "ipfs_local_gateway_v1";
const DEFAULT_DOMAIN_ASSETS_PREFIX = "/domain_default/";

// domain assets env persistence key
const ASSETS_ENV_KEY = "domain_assets_env_v1"; // "prod" | "test"

function pickPersistable(cfg) {
  if (!cfg) return null;
  return { domain: cfg.domain || "", backendLink: ensureSlash(cfg.backendLink || "") };
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
  } catch { }
}

export function AppProvider(props) {
  const i18n = useI18n();

  // top-level app state
  const [config, setConfig] = Solid.createSignal(null);
  const [info, setInfo] = Solid.createSignal(null);
  const [error, setError] = Solid.createSignal(null);
  const [loading, setLoading] = Solid.createSignal(true);
  const [lastUpdatedAt, setLastUpdatedAt] = Solid.createSignal(null);

  // Local IPFS prefs/state
  const [localIpfsEnabled, setLocalIpfsEnabled] = Solid.createSignal(localStorage.getItem(IPFS_LOCAL_KEY) === "1");
  const [localIpfsApiUrl, setLocalIpfsApiUrl] = Solid.createSignal(localStorage.getItem(IPFS_LOCAL_API_KEY) || "http://localhost:5001");
  const [localIpfsGateway, setLocalIpfsGateway] = Solid.createSignal(localStorage.getItem(IPFS_LOCAL_GATEWAY_KEY) || "");
  const [localIpfsStatus, setLocalIpfsStatus] = Solid.createSignal("unknown"); // "unknown" | "ok" | "down"
  let ipfsMonitorTid = null;

  // domain assets env (prod/test)
  const [assetsEnv, setAssetsEnvState] = Solid.createSignal(localStorage.getItem(ASSETS_ENV_KEY) || "prod");
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
    // push into endpoints immediately with what we know (backend + domain)
    try {
      configureEndpoints({ backendLink: nextCfg.backendLink, domain: nextCfg.domain || "" });
    } catch { /* ignore */ }
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
        // endpoints still need a nudge when only domain changes
        try {
          const langVal = i18n?.lang ? i18n.lang() : "en";
          configureEndpoints({ backendLink: next.backendLink, domain: next.domain || "" });
        } catch { }
      }
      saveOverride(next);
    } catch (e) {
      setError(e);
      pushErrorToast(e, {
        op: "updateConnect",
        backendLink: partial?.backendLink ?? config()?.backendLink,
        domain: partial?.domain ?? config()?.domain,
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
    // keep endpoints in sync
    try {
      const langVal = i18n?.lang ? i18n.lang() : "en";
      configureEndpoints({ backendLink: next.backendLink, domain: next.domain || "", lang: langVal });
    } catch { }
  }

  async function clearConnectOverride() {
    saveOverride(null);
    await init();
  }

  Solid.onMount(init);
  Solid.onCleanup(() => stopLocalIpfsMonitor());

  // ----- Derived helpers from /info -----
  const supportedDomains = Solid.createMemo(() => {
    const data = info();
    const list = Array.isArray(data?.domains) ? data.domains : [];
    return list
      .map((d) => (typeof d === "string" ? d : d?.name))
      .filter((name) => typeof name === "string" && name.trim().length > 0);
  });

  // Prefer explicit config().domain; if /info doesn't list it yet, still use it.
  const selectedDomain = Solid.createMemo(() => {
    const curDomain = (config()?.domain || "").trim();
    const list = Array.isArray(info()?.domains) ? info().domains : [];
    if (curDomain) {
      const found = list.find((d) => eq(dn(d), curDomain));
      return found ? (typeof found === "string" ? { name: found } : found) : { name: curDomain };
    }
    const first = list[0];
    return typeof first === "string" ? { name: first } : first || null;
  });
  const selectedDomainName = Solid.createMemo(() => dn(selectedDomain()) || "");

  const desiredChainId = Solid.createMemo(() =>
    typeof info()?.blockchain_id === "number" ? info().blockchain_id : null
  );
  const desiredChain = Solid.createMemo(() => {
    const id = desiredChainId();
    return id ? getChainMeta(id) : null;
  });
  async function ensureWalletOnDesiredChain() {
    const meta = desiredChain();
    if (!meta) throw new Error("Unknown target chain");
    await switchOrAddChain(meta);
  }

  const remoteIpfsGateways = Solid.createMemo(() => {
    const arr = info()?.ipfs_gateways;
    return Array.isArray(arr)
      ? arr
        .filter(Boolean)
        .map((s) => ensureSlash(s.trim()))
        .filter(Boolean)
      : [];
  });

  const activeIpfsGateways = Solid.createMemo(() => {
    if (localIpfsEnabled() && localIpfsGateway()) {
      return [ensureSlash(localIpfsGateway())];
    }
    return remoteIpfsGateways();
  });

  // ----- Domain assets (prod/test, prefix, config.yaml) -----
  const assetsBaseUrl = Solid.createMemo(() => {
    const baseProd = info()?.assets_url || "";
    const baseTest = info()?.temp_assets_url || "";
    const base = assetsEnv() === "test" ? baseTest : baseProd;
    return ensureSlash(base || "");
  });

  const [domainAssetsConfig, setDomainAssetsConfig] = Solid.createSignal(null);
  const [domainAssetsSource, setDomainAssetsSource] = Solid.createSignal(null); // "remote" | "default"
  const [domainAssetsPrefix, setDomainAssetsPrefix] = Solid.createSignal(DEFAULT_DOMAIN_ASSETS_PREFIX);

  const domainAssetsPrefixActive = Solid.createMemo(() => domainAssetsPrefix() || DEFAULT_DOMAIN_ASSETS_PREFIX);

  async function refreshDomainAssets() {
    const base = assetsBaseUrl();
    const domain = selectedDomainName();
    const computedPrefix = base && domain ? ensureSlash(base) + domain + "/" : "";
    const primaryUrl = computedPrefix ? computedPrefix + "config.yaml" : "";
    const fallbackUrl = DEFAULT_DOMAIN_ASSETS_PREFIX + "config.yaml";

    // try remote first, then default pack
    let res = null, used = null;
    try {
      if (primaryUrl) {
        const r = await fetchWithTimeout(primaryUrl, { timeoutMs: 8000 });
        if (r.ok) { res = r; used = "remote"; }
      }
    } catch { }
    if (!res) {
      try {
        const r = await fetchWithTimeout(fallbackUrl, { timeoutMs: 8000 });
        if (r.ok) { res = r; used = "default"; }
      } catch { }
    }
    if (!res) {
      setDomainAssetsConfig(null);
      setDomainAssetsSource(null);
      setDomainAssetsPrefix(DEFAULT_DOMAIN_ASSETS_PREFIX);
      return;
    }

    const text = await res.text();
    let cfg = null;
    try { cfg = parse(text) || null; } catch { cfg = null; }

    setDomainAssetsConfig(cfg);
    setDomainAssetsSource(used);
    setDomainAssetsPrefix(used === "remote" ? computedPrefix : DEFAULT_DOMAIN_ASSETS_PREFIX);
  }

  Solid.createEffect(() => {
    // refresh when env or selected domain changes or when /info refreshes
    assetsEnv(); selectedDomainName(); info();
    refreshDomainAssets();
  });

  function assetUrl(relPath) {
    const rel = String(relPath || "").replace(/^\/+/, "");
    const prefix = domainAssetsPrefixActive();
    if (!prefix) return "";
    return ensureSlash(prefix) + rel;
  }

  // Keep endpoints synced reactively (backend/domain/lang)
  Solid.createEffect(() => {
    const backend = config()?.backendLink;
    const domainName = selectedDomainName();
    const langVal = i18n?.lang ? i18n.lang() : "en";
    if (backend) {
      configureEndpoints({ backendLink: backend, domain: domainName, lang: langVal });
    }
  });

  // ----- Local IPFS helpers -----
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

  async function probeLocalIpfs(apiUrl) {
    const url = trimSlash(apiUrl || "");
    if (!url) throw new Error("Empty IPFS API URL");
    const res = await fetchWithTimeout(`${url}/api/v0/version`, { method: "POST", timeoutMs: 4000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const gw = url.replace(/:\d+$/, ":8080").replace(/\/api$/, "");
    return gw.endsWith("/") ? gw : gw + "/";
  }

  function startLocalIpfsMonitor() {
    stopLocalIpfsMonitor();
    ipfsMonitorTid = setInterval(() => { pingLocalIpfs(); }, 10_000);
    pingLocalIpfs();
  }
  function stopLocalIpfsMonitor() {
    if (ipfsMonitorTid) { clearInterval(ipfsMonitorTid); ipfsMonitorTid = null; }
  }
  async function disableLocalIpfs() {
    stopLocalIpfsMonitor();
    setLocalIpfsEnabled(false);
    setLocalIpfsGateway("");
    localStorage.setItem(IPFS_LOCAL_KEY, "0");
    localStorage.removeItem(IPFS_LOCAL_GATEWAY_KEY);
    pushToast({ type: "info", message: i18n.t("settings.ipfs.localDisabled") });
  }

  Solid.createEffect(() => {
    const backend = config()?.backendLink;
    const domainName = selectedDomainName();
    if (backend) configureEndpoints({ backendLink: backend, domain: domainName });
  });


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
    selectedDomain,           // object { name, ... } (or null)
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
    setLocalIpfsApiUrl,

    // i18n (global from context)
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
  const ctx = Solid.useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");

  if (typeof window !== "undefined") {
    window.__app = ctx; // for devtools poking
  }
  return ctx;
}
