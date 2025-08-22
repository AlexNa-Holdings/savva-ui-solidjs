// src/context/AppContext.jsx
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

function pickPersistable(cfg) { if (!cfg) return null; return { domain: cfg.domain || "", backendLink: ensureSlash(cfg.backendLink || "") }; }
function loadOverride() { try { const raw = localStorage.getItem(OVERRIDE_KEY); if (!raw) return null; return pickPersistable(JSON.parse(raw)); } catch { return null; } }
function saveOverride(obj) { try { if (!obj) localStorage.removeItem(OVERRIDE_KEY); else localStorage.setItem(OVERRIDE_KEY, JSON.stringify(pickPersistable(obj))); } catch {} }

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
    try { configureEndpoints({ backendLink: nextCfg.backendLink, domain: nextCfg.domain || "" }); } catch {}
  }

  async function init() {
    setLoading(true); setError(null);
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
    } finally { setLoading(false); }
  }

  async function updateConnect(partial) {
    try {
      setLoading(true); setError(null);
      const cur = config() || {};
      const next = { ...cur, ...partial, backendLink: ensureSlash(partial?.backendLink ?? cur.backendLink) };
      const backendChanged = next.backendLink !== cur.backendLink;
      if (backendChanged) {
        await applyConfig(next);
      } else {
        setConfig(next);
        setLastUpdatedAt(Date.now());
        try { configureEndpoints({ backendLink: next.backendLink, domain: next.domain || "" }); } catch {}
      }
      saveOverride(next);
    } catch (e) {
      setError(e);
      pushErrorToast(e, { op: "updateConnect", backendLink: partial?.backendLink ?? config()?.backendLink, domain: partial?.domain ?? config()?.domain });
    } finally { setLoading(false); }
  }

  function setDomain(nextDomain) {
    const cur = config() || {};
    const next = { ...cur, domain: nextDomain || "" };
    setConfig(next);
    saveOverride(next);
    setLastUpdatedAt(Date.now());
    try { configureEndpoints({ backendLink: next.backendLink, domain: next.domain || "" }); } catch {}
  }

  async function clearConnectOverride() { saveOverride(null); await init(); }

  Solid.onMount(init);

  // --- Domain resolution ---
  const supportedDomains = Solid.createMemo(() => {
    const list = info()?.domains;
    if (!Array.isArray(list)) return [];
    const res = [];
    const seen = new Set();
    for (const d of list) {
      const name = typeof d === "string" ? d : (d && d.name) || "";
      const website = typeof d === "object" ? (d.website || d.url || d.link || "") : "";
      const key = name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      res.push({ name, website });
    }
    return res;
  });

  // IMPORTANT: prefer explicit config domain (YAML/override). If it isn't in /info, still use it.
  const selectedDomain = Solid.createMemo(() => {
    const explicit = String(config()?.domain || "").trim();
    if (explicit) {
      const hit = supportedDomains().find((d) => eq(d.name, explicit));
      return hit || explicit; // string if not present in /info
    }
    // no explicit domain: take the first from /info if available
    return supportedDomains()[0] || "";
  });
  const selectedDomainName = Solid.createMemo(() => dn(selectedDomain()) || "");

  // --- Blockchain target ---
  const desiredChainId = Solid.createMemo(() => typeof info()?.blockchain_id === "number" ? info().blockchain_id : null);
  const desiredChain = Solid.createMemo(() => { const id = desiredChainId(); return id ? getChainMeta(id) : null; });
  async function ensureWalletOnDesiredChain() { const meta = desiredChain(); if (!meta) throw new Error("Unknown target chain"); await switchOrAddChain(meta); }

  // --- IPFS gateways ---
  const remoteIpfsGateways = Solid.createMemo(() => {
    const arr = info()?.ipfs_gateways;
    return Array.isArray(arr) ? arr.filter(Boolean).map((s) => ensureSlash(s.trim())).filter(Boolean) : [];
  });
  const activeIpfsGateways = Solid.createMemo(() => {
    if (ipfs.localIpfsEnabled() && ipfs.localIpfsGateway()) return [ensureSlash(ipfs.localIpfsGateway())];
    return remoteIpfsGateways();
  });

  // --- Assets base URL from /info ---
  const assetsBaseUrl = Solid.createMemo(() => {
    const baseProd = info()?.assets_url || "";
    const baseTest = info()?.temp_assets_url || "";
    const base = assetsEnv() === "test" ? baseTest : baseProd;
    return ensureSlash(base || "");
  });

  // --- Domain assets state ---
  const [domainAssetsConfig, setDomainAssetsConfig] = Solid.createSignal(null);
  const [domainAssetsSource, setDomainAssetsSource] = Solid.createSignal(null); // "domain" | "default" | null
  const [domainAssetsPrefix, setDomainAssetsPrefix] = Solid.createSignal(DEFAULT_DOMAIN_ASSETS_PREFIX);
  const domainAssetsPrefixActive = Solid.createMemo(() => domainAssetsPrefix() || DEFAULT_DOMAIN_ASSETS_PREFIX);

  function assetUrl(relPath) {
    const rel = String(relPath || "").replace(/^\/+/, "");
    const prefix = domainAssetsPrefixActive();
    if (!prefix) return "";
    return ensureSlash(prefix) + rel;
  }

  // --- Load domain dictionaries (i18n) from the active assets pack ---
  const [domainDictionaries] = Solid.createResource(
    () => {
      const cfg = domainAssetsConfig();
      if (!cfg) return null;
      const locales = Array.isArray(cfg.locales) ? cfg.locales : [];
      const items = locales
        .map((l) => {
          const code = (l?.code || "").toLowerCase();
          const path = l?.dictionary || l?.file || (code ? `i18n/${code}.yaml` : "");
          if (!code || !path) return null;
          return { code, path };
        })
        .filter(Boolean);
      if (items.length === 0) return null;
      const rev = `${domainAssetsPrefixActive()}|${cfg.assets_cid || cfg.cid || ""}`;
      return { items, rev };
    },
    async (key) => {
      if (!key) return {};
      const out = {};
      for (const { code, path } of key.items) {
        try {
          const url = assetUrl(path);
          const res = await fetchWithTimeout(url, { timeoutMs: 8000, cache: "no-store" });
          if (!res.ok) continue;
          const text = await res.text();
          const parsed = parse(text) || {};
          const normalized = {};
          for (const [k, v] of Object.entries(parsed)) normalized[k] = typeof v === "string" ? v : String(v);
          out[code] = normalized;
        } catch { /* ignore */ }
      }
      return out;
    }
  );

  Solid.createEffect(() => {
    const dicts = domainDictionaries() || {};
    if (i18n && typeof i18n.setDomainDictionaries === "function") {
      i18n.setDomainDictionaries(dicts);
    }
  });

  // --- Refresh domain assets (config.yaml + prefix)
  async function refreshDomainAssets() {
    const base = assetsBaseUrl();
    const domain = selectedDomainName();
    const computed = base && domain ? ensureSlash(base) + domain + "/" : "";
    const defaultPrefix = DEFAULT_DOMAIN_ASSETS_PREFIX;

    // Helper to load and parse config.yaml from a prefix
    async function tryLoad(prefix) {
      if (!prefix) return null;
      const url = ensureSlash(prefix) + "config.yaml";
      let res;
      try {
        res = await fetchWithTimeout(url, { timeoutMs: 8000, cache: "no-store" });
      } catch { return null; }
      if (!res.ok) return null;
      try {
        const text = await res.text();
        return parse(text) || {};
      } catch { return null; }
    }

    // 1) Try domain-specific pack
    let source = null;
    let usedPrefix = computed || "";
    let cfg = await tryLoad(usedPrefix);
    if (cfg) {
      source = "domain";
    } else {
      // 2) Fallback to default pack
      usedPrefix = defaultPrefix;
      cfg = await tryLoad(usedPrefix);
      source = cfg ? "default" : null;
    }

    setDomainAssetsPrefix(usedPrefix || defaultPrefix);
    setDomainAssetsSource(source);
    setDomainAssetsConfig(cfg || null);
  }

  // React to changes in assets base, env, or domain
  Solid.createEffect(() => {
    // Build a reactive key to avoid redundant fetches
    const key = `${assetsBaseUrl()}|${assetsEnv()}|${selectedDomainName()}`;
    if (!assetsBaseUrl()) {
      setDomainAssetsPrefix(DEFAULT_DOMAIN_ASSETS_PREFIX);
      setDomainAssetsSource(null);
      setDomainAssetsConfig(null);
      return;
    }
    // Run async without blocking the effect
    Promise.resolve().then(refreshDomainAssets);
  });

  // Also re-apply when /info finishes loading for the first time
  Solid.createEffect(() => { if (info()) Promise.resolve().then(refreshDomainAssets); });

  const value = {
    config, info, error, loading, lastUpdatedAt,
    ...ipfs,
    supportedDomains, selectedDomain,
    desiredChainId, desiredChain, remoteIpfsGateways, activeIpfsGateways,
    assetsEnv, setAssetsEnv, assetsBaseUrl,
    domainAssetsConfig, domainAssetsSource, domainAssetsPrefix: domainAssetsPrefixActive,
    refreshDomainAssets, assetUrl,
    reload: init, updateConnect, clearConnectOverride, setDomain, ensureWalletOnDesiredChain,
    t: i18n.t, lang: i18n.lang, setLang: i18n.setLang,
    showKeys: i18n.showKeys, setShowKeys: i18n.setShowKeys, i18nAvailable: i18n.available,
  };

  return <AppContext.Provider value={value}>{props.children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = Solid.useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  if (typeof window !== "undefined") window.__app = ctx;
  return ctx;
}
