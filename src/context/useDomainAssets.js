// src/context/useDomainAssets.js
import { createSignal, createEffect, on } from "solid-js";
import { parse } from "yaml";
import { dbg } from "../utils/debug.js";

function ensureSlash(s) { return s ? (s.endsWith("/") ? s : s + "/") : ""; }
const dn = (d) => String(d || "").trim().toLowerCase();

export function useDomainAssets({ info, selectedDomainName, i18n }) {
  const [assetsEnv, setAssetsEnv] = createSignal("prod");
  const [assetsBaseUrl, setAssetsBaseUrl] = createSignal("");
  const [domainAssetsPrefix, setDomainAssetsPrefix] = createSignal("/domain_default/");
  const [domainAssetsSource, setDomainAssetsSource] = createSignal(null); // 'domain' | 'default' | null
  const [domainAssetsConfig, setDomainAssetsConfig] = createSignal(null);
  const [loadingConfig, setLoadingConfig] = createSignal(false);
  const [error, setError] = createSignal(null);

  // 1) assets base depends on /info + env (prod/test)
  createEffect(() => {
    const i = info?.();
    const env = assetsEnv();
    const base = env === "test" ? (i?.temp_assets_url || "/temp_assets/") : (i?.assets_url || "/domain_assets/");
    const next = ensureSlash(base);
    const prev = assetsBaseUrl();
    if (prev !== next) {
      dbg.log("assets", "assetsBaseUrl changed", { prev, next });
      setAssetsBaseUrl(next);
    }
  });

  // 2) Load domain config ONCE per (assetsBaseUrl, selectedDomainName).
  createEffect(on([assetsBaseUrl, selectedDomainName], async () => {
    const base = assetsBaseUrl();
    const dom = dn(selectedDomainName?.());
    if (!base) return;

    const tryUrl = `${base}${dom}/config.yaml`;
    const fallbackUrl = "/domain_default/config.yaml";

    setLoadingConfig(true);
    setError(null);

    try {
      dbg.log("assets", "loading config.yaml", { tryUrl });
      const r = await fetch(tryUrl, { cache: "no-store" });
      if (r.ok) {
        const cfg = parse(await r.text()) || {};
        setDomainAssetsConfig(cfg);
        setDomainAssetsPrefix(`${base}${dom}/`);
        setDomainAssetsSource("domain");
        dbg.log("assets", "domainAssetsPrefix (ACTIVE) changed", { next: `${base}${dom}/` });
      } else {
        throw new Error(`domain pack 404`);
      }
    } catch {
      dbg.log("assets", "loaded default config.yaml", { url: fallbackUrl });
      const r = await fetch(fallbackUrl, { cache: "no-store" });
      const cfg = parse(await r.text()) || {};
      setDomainAssetsConfig(cfg);
      setDomainAssetsPrefix("/domain_default/");
      setDomainAssetsSource("default");
      dbg.log("assets", "domainAssetsPrefix (ACTIVE) changed", { next: "/domain_default/" });
    } finally {
      setLoadingConfig(false);
      dbg.log("assets", "domainAssetsConfig loaded/changed");
    }
  }));

  // 3) Publish domain language codes once per config load.
  createEffect(() => {
    const cfg = domainAssetsConfig();
    const locales = Array.isArray(cfg?.locales) ? cfg.locales : [];
    const codes = locales
      .map((l) => String(l?.code || "").trim().toLowerCase().split(/[-_]/)[0])
      .filter(Boolean);

    if (codes.length > 0 && i18n?.setDomainLangCodes) {
      i18n.setDomainLangCodes(codes);
      dbg.log("assets", "i18n domain language codes updated", codes);
    }
  });

  return {
    assetsEnv, setAssetsEnv,
    assetsBaseUrl,
    domainAssetsPrefix,
    domainAssetsSource,
    domainAssetsConfig,
    loadingConfig,
    error,
  };
}
