// src/context/useAppOrchestrator.js
import { createSignal, onMount } from "solid-js";
import { parse } from "yaml";
import { configureEndpoints, httpBase, wsUrl } from "../net/endpoints.js";
import { getWsClient } from "../net/wsRuntime.js";
import { dbg } from "../utils/debug.js";

const OVERRIDE_KEY = "connect_override";
const dn = (d) => (typeof d === "string" ? d : d?.name || "");
function ensureSlash(s) { return s ? (s.endsWith("/") ? s : s + "/") : ""; }
function pickPersistable(cfg) {
  if (!cfg) return null;
  return { domain: cfg.domain || "", backendLink: ensureSlash(cfg.backendLink || "") };
}
function loadOverride() {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (!raw) return null;
    return pickPersistable(JSON.parse(raw));
  } catch { return null; }
}
function saveOverride(obj) {
  try {
    if (!obj) localStorage.removeItem(OVERRIDE_KEY);
    else localStorage.setItem(OVERRIDE_KEY, JSON.stringify(pickPersistable(obj)));
  } catch {}
}
async function fetchInfo(cfg) {
    const res = await fetch(ensureSlash(cfg.backendLink) + "info", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`/info failed: ${res.status}`);
    return await res.json();
}

export function useAppOrchestrator({ auth, i18n }) {
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal(null);
  const [config, setConfig] = createSignal(null);
  const [info, setInfo] = createSignal(null);

  const [assetsEnv, setAssetsEnv] = createSignal("prod");
  const [assetsBaseUrl, setAssetsBaseUrl] = createSignal("");
  const [domainAssetsPrefix, setDomainAssetsPrefix] = createSignal("/domain_default/");
  const [domainAssetsSource, setDomainAssetsSource] = createSignal(null);
  const [domainAssetsConfig, setDomainAssetsConfig] = createSignal(null);

  const initializeOrSwitch = async (newSettings) => {
    setLoading(true);
    setError(null);
    const isSwitching = !!newSettings;
    const oldBackendLink = httpBase();

    try {
      if (isSwitching && newSettings.backendLink && ensureSlash(newSettings.backendLink) !== oldBackendLink) {
        await auth.logout();
      }

      let nextConfig;
      if (isSwitching) {
        nextConfig = { ...config(), ...newSettings };
        saveOverride(nextConfig);
      } else {
        const res = await fetch("/default_connect.yaml", { cache: "no-store" });
        if (!res.ok) throw new Error("YAML load failed: " + res.status);
        const baseCfg = parse(await res.text());
        const override = loadOverride();
        nextConfig = { ...baseCfg, ...override };
      }

      if (!nextConfig.backendLink) throw new Error("Missing backendLink in config");
      configureEndpoints({ backendLink: nextConfig.backendLink, domain: dn(nextConfig.domain) });
      const infoData = await fetchInfo(nextConfig);
      setInfo(infoData);

      const supported = (infoData.domains || []).map(d => dn(d));
      let finalDomainName = dn(nextConfig.domain);
      if (supported.length > 0 && !supported.includes(finalDomainName)) {
        finalDomainName = supported[0] || "";
      }
      nextConfig.domain = finalDomainName;
      setConfig(nextConfig);
      configureEndpoints({ backendLink: nextConfig.backendLink, domain: finalDomainName });

      const base = (assetsEnv() === "test" ? infoData.temp_assets_url : infoData.assets_url) || "/";
      setAssetsBaseUrl(ensureSlash(base));

      let domainPrefix = "/domain_default/";
      let loadedSource = 'default';
      let domainCfg = {};
      if (finalDomainName) {
        const tryUrl = `${ensureSlash(base)}${finalDomainName}/config.yaml`;
        try {
          const res = await fetch(tryUrl, { cache: "no-store" });
          if (res.ok) {
            domainCfg = parse(await res.text()) || {};
            domainPrefix = `${ensureSlash(base)}${finalDomainName}/`;
            loadedSource = 'domain';
          }
        } catch (e) {
          // fallback is handled below
        }
      }
      
      if (loadedSource === 'default') {
        const fallbackUrl = "/domain_default/config.yaml";
        const res = await fetch(fallbackUrl, { cache: "no-store" });
        domainCfg = parse(await res.text()) || {};
      }
      setDomainAssetsPrefix(domainPrefix);
      setDomainAssetsSource(loadedSource);
      setDomainAssetsConfig(domainCfg);

      const ws = getWsClient();
      ws.setUrl(wsUrl());
      ws.connect();
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  onMount(() => initializeOrSwitch());
  
  const setDomain = (nextDomain) => initializeOrSwitch({ domain: nextDomain });
  const clearConnectOverride = () => {
    saveOverride(null);
    initializeOrSwitch();
  };

  return {
    config, info, error, loading, setDomain,
    initializeOrSwitch, clearConnectOverride,
    assetsEnv, setAssetsEnv, assetsBaseUrl,
    domainAssetsPrefix, domainAssetsSource, domainAssetsConfig,
  };
}