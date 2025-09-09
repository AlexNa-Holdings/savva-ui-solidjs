// src/context/useDomainAssets.js
import { createSignal, createMemo, createResource, createEffect, on } from "solid-js";
import { parse } from "yaml";
import { fetchWithTimeout } from "../utils/net.js";
import { loadAssetResource } from "../utils/assetLoader.js";
import { dbg } from "../utils/debug.js";

const ASSETS_ENV_KEY = "domain_assets_env";
const DEFAULT_DOMAIN_ASSETS_PREFIX = "/domain_default/";

export function useDomainAssets(app) {
  const [assetsEnv, setAssetsEnvState] = createSignal(localStorage.getItem(ASSETS_ENV_KEY) || "prod");
  const [domainAssetsConfig, setDomainAssetsConfig] = createSignal(null);
  const [domainAssetsSource, setDomainAssetsSource] = createSignal(null);
  const [domainAssetsPrefix, setDomainAssetsPrefix] = createSignal(DEFAULT_DOMAIN_ASSETS_PREFIX);
  const [loadingConfig, setLoadingConfig] = createSignal(false);

  // --- sticky cache for the current domain ---
  let stickyDomain = "";
  let stickyConfig = null;  // last-good parsed config.yaml for <domain>
  let stickyPrefix = "";    // last-good prefix, e.g. "https://.../domain/"
  let stickySource = null;  // "domain" | "default" | null

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

    // Reset sticky cache if domain actually changed
    if (domain && domain !== stickyDomain) {
      dbg.log("assets", "domain changed → reset sticky cache", { prev: stickyDomain, next: domain });
      stickyDomain = domain;
      stickyConfig = null;
      stickyPrefix = "";
      stickySource = null;
    }

    async function tryLoad(prefix) {
      if (!prefix) return null;
      try {
        const url = `${prefix}config.yaml`;
        const res = await fetchWithTimeout(url, { timeoutMs: 8000, cache: "no-store" });
        if (!res.ok) return null;
        const text = await res.text();
        const cfg = parse(text) || {};
        dbg.group(`assets: loaded config.yaml from ${prefix}`);
        dbg.log("assets", "summary:", {
          hasLocales: !!(cfg.locales && cfg.locales.length),
          locales: (cfg.locales || []).map((l) => l?.code).filter(Boolean),
          assets_cid: cfg.assets_cid || cfg.cid || null,
        });
        dbg.groupEnd();
        return cfg;
      } catch {
        return null;
      }
    }

    // 1) Try the domain pack
    const domainCfg = await tryLoad(computed);

    if (domainCfg) {
      // Successful domain config → promote to active and update sticky cache
      setDomainAssetsPrefix(computed);
      setDomainAssetsSource("domain");
      setDomainAssetsConfig(domainCfg);
      stickyConfig = domainCfg;
      stickyPrefix = computed;
      stickySource = "domain";
      setLoadingConfig(false);
      return;
    }

    // 2) Domain pack failed. If we already have a good domain config, STAY on it.
    if (stickyConfig && stickySource === "domain" && stickyPrefix) {
      dbg.warn("assets", "domain config reload failed — keeping last-good domain config (no fallback)", {
        domain,
        computed,
        stickyPrefix,
      });
      // keep existing signals as-is
      setLoadingConfig(false);
      return;
    }

    // 3) No last-good domain config → try default pack once.
    const defaultCfg = await tryLoad(DEFAULT_DOMAIN_ASSETS_PREFIX);
    setDomainAssetsPrefix(DEFAULT_DOMAIN_ASSETS_PREFIX);
    setDomainAssetsSource(defaultCfg ? "default" : null);
    setDomainAssetsConfig(defaultCfg || null);
    stickyConfig = defaultCfg || null;
    stickyPrefix = DEFAULT_DOMAIN_ASSETS_PREFIX;
    stickySource = defaultCfg ? "default" : null;
    setLoadingConfig(false);
  }

  // Load per-locale dictionaries from the active pack
  const [domainDictionaries] = createResource(() => {
    const cfg = domainAssetsConfig();
    const locales = Array.isArray(cfg?.locales) ? cfg.locales : [];
    const items = locales
      .map((l) => ({ code: (l?.code || "").toLowerCase(), path: l?.dictionary || l?.file }))
      .filter((l) => l.code && l.path);
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

  // Publish dictionaries to i18n
  createEffect(() => app.i18n.setDomainDictionaries(domainDictionaries() || {}));

  // Publish normalized domain language codes to i18n (so all consumers see a stable set)
  createEffect(() => {
    const cfg = domainAssetsConfig();
    const codes = Array.isArray(cfg?.locales)
      ? cfg.locales.map((l) => String(l?.code || "").toLowerCase()).filter(Boolean)
      : [];
    app.i18n.setDomainLangCodes(codes);
    if (codes.length) {
      dbg.log("assets", "i18n domain language codes updated", codes);
    }
  });

  // Only (re)load when /info, domain, or env change — never on lang change.
  createEffect(on([app.info, app.selectedDomainName, assetsEnv], () => {
    if (app.info()) refreshDomainAssets();
  }));

  return {
    assetsEnv,
    setAssetsEnv,
    assetsBaseUrl,
    domainAssetsConfig,
    domainAssetsSource,
    domainAssetsPrefix: domainAssetsPrefixActive,
    refreshDomainAssets,
    assetUrl,
    loadingConfig,
  };
}
