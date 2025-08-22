import * as Solid from "solid-js";
import { parse } from "yaml";
import { getChainMeta } from "../blockchain/chains";
import { switchOrAddChain } from "../blockchain/wallet";
import { pushToast, pushErrorToast } from "../components/ui/toast.js";
import { useI18n } from "../i18n/useI18n";
import { fetchWithTimeout } from "../utils/net.js";
import { configureEndpoints } from "../net/endpoints";
import { loadAssetResource } from "../utils/assetLoader.js";
import { useLocalIpfs } from "../hooks/useLocalIpfs.js";

function ensureSlash(s) { if (!s) return ""; return s.endsWith("/") ? s : s + "/"; }
const dn = (d) => (typeof d === "string" ? d : d?.name || "");
const eq = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

const AppContext = Solid.createContext();
const OVERRIDE_KEY = "connect_override";
const DEFAULT_DOMAIN_ASSETS_PREFIX = "/domain_default/";
const ASSETS_ENV_KEY = "domain_assets_env";

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
  const ipfs = useLocalIpfs({ pushToast, pushErrorToast, t: i18n.t });

  const [config, setConfig] = Solid.createSignal(null);
  const [info, setInfo] = Solid.createSignal(null);
  const [error, setError] = Solid.createSignal(null);
  const [loading, setLoading] = Solid.createSignal(true);
  const [lastUpdatedAt, setLastUpdatedAt] = Solid.createSignal(null);

  const [assetsEnv, setAssetsEnvState] = Solid.createSignal(localStorage.getItem(ASSETS_ENV_KEY) || "prod");
  function setAssetsEnv(next) {
    const v = next === "test" ? "test" : "prod";
    localStorage.setItem(ASSETS_ENV_KEY, v);
    setAssetsEnvState(v);
  }
  
  // --- Start of Restored Core Functions ---

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
    try {
      configureEndpoints({ backendLink: nextCfg.backendLink, domain: nextCfg.domain || "" });
    } catch { }
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

      const baseCfg = { domain: data.domain || "", backendLink: ensureSlash(data.backendLink), gear: !!data.gear };
      const ovr = loadOverride();
      const merged = { ...baseCfg, ...(ovr ? { ...ovr } : {}) };
      await applyConfig(merged);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  async function updateConnect(partial) {
    try {
      setLoading(true);
      setError(null);
      const cur = config() || {};
      const next = { ...cur, ...partial, backendLink: ensureSlash(partial?.backendLink ?? cur.backendLink) };
      const backendChanged = next.backendLink !== cur.backendLink;
      if (backendChanged) {
        await applyConfig(next);
      } else {
        setConfig(next);
        setLastUpdatedAt(Date.now());
        try {
          const langVal = i18n?.lang ? i18n.lang() : "en";
          configureEndpoints({ backendLink: next.backendLink, domain: next.domain || "" });
        } catch { }
      }
      saveOverride(next);
    } catch (e) {
      setError(e);
      pushErrorToast(e, { op: "updateConnect", backendLink: partial?.backendLink ?? config()?.backendLink, domain: partial?.domain ?? config()?.domain });
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
    try {
      const langVal = i18n?.lang ? i18n.lang() : "en";
      configureEndpoints({ backendLink: next.backendLink, domain: next.domain || "", lang: langVal });
    } catch { }
  }

  async function clearConnectOverride() {
    saveOverride(null);
    await init();
  }

  // --- End of Restored Core Functions ---

  Solid.onMount(init);

  const supportedDomains = Solid.createMemo(() => { /* ... */ });
  const selectedDomain = Solid.createMemo(() => { /* ... */ });
  const selectedDomainName = Solid.createMemo(() => dn(selectedDomain()) || "");

  const desiredChainId = Solid.createMemo(() => typeof info()?.blockchain_id === "number" ? info().blockchain_id : null);
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
    return Array.isArray(arr) ? arr.filter(Boolean).map((s) => ensureSlash(s.trim())).filter(Boolean) : [];
  });

  const activeIpfsGateways = Solid.createMemo(() => {
    if (ipfs.localIpfsEnabled() && ipfs.localIpfsGateway()) {
      return [ensureSlash(ipfs.localIpfsGateway())];
    }
    return remoteIpfsGateways();
  });

  const assetsBaseUrl = Solid.createMemo(() => {
    const baseProd = info()?.assets_url || "";
    const baseTest = info()?.temp_assets_url || "";
    const base = assetsEnv() === "test" ? baseTest : baseProd;
    return ensureSlash(base || "");
  });

  const [domainAssetsConfig, setDomainAssetsConfig] = Solid.createSignal(null);
  const [domainAssetsSource, setDomainAssetsSource] = Solid.createSignal(null);
  const [domainAssetsPrefix, setDomainAssetsPrefix] = Solid.createSignal(DEFAULT_DOMAIN_ASSETS_PREFIX);
  const domainAssetsPrefixActive = Solid.createMemo(() => domainAssetsPrefix() || DEFAULT_DOMAIN_ASSETS_PREFIX);

  function assetUrl(relPath) {
    const rel = String(relPath || "").replace(/^\/+/, "");
    const prefix = domainAssetsPrefixActive();
    if (!prefix) return "";
    return ensureSlash(prefix) + rel;
  }

  const [domainDictionaries] = Solid.createResource(/* ... */);
  Solid.createEffect(() => { /* ... */ });
  async function refreshDomainAssets() { /* ... */ }
  Solid.createEffect(() => { /* ... */ });
  Solid.createEffect(() => { /* ... */ });

  const value = {
    config, info, error, loading, lastUpdatedAt,
    ...ipfs,
    supportedDomains, selectedDomain, desiredChainId, desiredChain, remoteIpfsGateways, activeIpfsGateways,
    assetsEnv, setAssetsEnv, assetsBaseUrl, domainAssetsConfig, domainAssetsSource, domainAssetsPrefix: domainAssetsPrefixActive, refreshDomainAssets, assetUrl,
    reload: init, updateConnect, clearConnectOverride, setDomain, ensureWalletOnDesiredChain,
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
    window.__app = ctx;
  }
  return ctx;
}