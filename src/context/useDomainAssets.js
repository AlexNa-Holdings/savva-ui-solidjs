// src/context/useDomainAssets.js
import { createSignal, createMemo, createResource, createEffect, on } from "solid-js";
import { parse } from "yaml";
import { fetchWithTimeout } from "../utils/net.js";
import { loadAssetResource } from "../utils/assetLoader.js";

const ASSETS_ENV_KEY = "domain_assets_env";
const DEFAULT_DOMAIN_ASSETS_PREFIX = "/domain_default/";

export function useDomainAssets(app) {
  const [assetsEnv, setAssetsEnvState] = createSignal(localStorage.getItem(ASSETS_ENV_KEY) || "prod");
  const [domainAssetsConfig, setDomainAssetsConfig] = createSignal(null);
  const [domainAssetsSource, setDomainAssetsSource] = createSignal(null);
  const [domainAssetsPrefix, setDomainAssetsPrefix] = createSignal(DEFAULT_DOMAIN_ASSETS_PREFIX);
  const [loadingConfig, setLoadingConfig] = createSignal(false);

  function setAssetsEnv(next) {
    const v = next === "test" ? "test" : "prod";
    localStorage.setItem(ASSETS_ENV_KEY, v);
    setAssetsEnvState(v);
  }

  const assetsBaseUrl = createMemo(() => {
    const info = app.info();
    if (!info) return "";
    const base = assetsEnv() === "test" ? info.temp_assets_url : info.assets_url;
    return base?.endsWith("/") ? base : (base || "") + "/";
  });

  const domainAssetsPrefixActive = createMemo(() => domainAssetsPrefix() || DEFAULT_DOMAIN_ASSETS_PREFIX);

  function assetUrl(relPath) {
    const rel = String(relPath || "").replace(/^\/+/, "");
    return (domainAssetsPrefixActive() || "") + rel;
  }

  async function refreshDomainAssets() {
    setLoadingConfig(true);
    const base = assetsBaseUrl();
    const domain = app.selectedDomainName();
    const computed = base && domain ? `${base}${domain}/` : "";

    async function tryLoad(prefix) {
      if (!prefix) return null;
      try {
        const res = await fetchWithTimeout(`${prefix}config.yaml`, { timeoutMs: 8000, cache: "no-store" });
        return res.ok ? (parse(await res.text()) || {}) : null;
      } catch { return null; }
    }

    let cfg = await tryLoad(computed);
    if (cfg) {
      setDomainAssetsPrefix(computed);
      setDomainAssetsSource("domain");
    } else {
      cfg = await tryLoad(DEFAULT_DOMAIN_ASSETS_PREFIX);
      setDomainAssetsPrefix(DEFAULT_DOMAIN_ASSETS_PREFIX);
      setDomainAssetsSource(cfg ? "default" : null);
    }
    setDomainAssetsConfig(cfg || null);
    setLoadingConfig(false);
  }

  const [domainDictionaries] = createResource(() => {
    const cfg = domainAssetsConfig();
    const locales = Array.isArray(cfg?.locales) ? cfg.locales : [];
    const items = locales.map(l => ({ code: (l?.code || "").toLowerCase(), path: l?.dictionary || l?.file })).filter(l => l.code && l.path);
    if (items.length === 0) return null;
    return { items, rev: `${domainAssetsPrefixActive()}|${cfg.assets_cid || cfg.cid || ""}` };
  }, async (key) => {
    if (!key) return {};
    const dicts = {};
    for (const { code, path } of key.items) {
      try {
        dicts[code] = await loadAssetResource({ assetUrl }, path, { type: "yaml" });
      } catch { /* ignore */ }
    }
    return dicts;
  });

  createEffect(() => app.i18n.setDomainDictionaries(domainDictionaries() || {}));
  
  createEffect(on([app.info, app.selectedDomainName, assetsEnv], () => {
    if (app.info()) {
      refreshDomainAssets();
    }
  }));

  return { assetsEnv, setAssetsEnv, assetsBaseUrl, domainAssetsConfig, domainAssetsSource, domainAssetsPrefix: domainAssetsPrefixActive, refreshDomainAssets, assetUrl, loadingConfig };
}