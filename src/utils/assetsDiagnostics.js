// src/utils/assetsDiagnostics.js
// Utility to assess domain asset resources and common pitfalls.
// Pure JS (no Solid imports). You pass values from useApp().

import { fetchWithTimeout } from "./net";

// Normalize join with a trailing slash on base and no leading slash on rel
function join(base, rel) {
  const b = base.endsWith("/") ? base : base + "/";
  const r = String(rel || "").replace(/^\/+/, "");
  return b + r;
}

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function summarizeLogos(cfg) {
  if (!cfg) return { has: false, fields: [], pickable: [] };
  const raw = cfg.logos ?? cfg.logo ?? null;
  if (!raw) return { has: false, fields: [], pickable: [] };
  if (typeof raw === "string") return { has: true, fields: ["default"], pickable: ["default"] };

  const l = {
    dark_mobile: raw.dark_mobile ?? raw.mobile_dark ?? null,
    light_mobile: raw.light_mobile ?? raw.mobile_light ?? null,
    mobile: raw.mobile ?? null,
    dark: raw.dark ?? null,
    light: raw.light ?? null,
    default: raw.default ?? raw.fallback ?? null,
  };
  const fields = Object.entries(l).filter(([,v]) => !!v).map(([k]) => k);
  return {
    has: fields.length > 0,
    fields,
    pickable: fields, // actual keys present
  };
}

/**
 * assessAssets
 * @param {object} p
 * @param {string} p.env 'prod' | 'test'
 * @param {string} p.assetsBaseUrl from /info (based on env)
 * @param {string} p.selectedDomainName current domain string
 * @param {string} p.domainAssetsPrefixActive active prefix in useApp (domain or /domain_default/)
 * @param {object|null} p.domainAssetsConfig parsed config.yaml (or null when default pack)
 * @param {'remote'|'default'|null} p.domainAssetsSource where config came from
 * @param {(url: string, opts?: any) => Promise<Response>} [p.fetcher] custom fetch (defaults to fetchWithTimeout)
 */
export async function assessAssets(p) {
  const fetcher = p.fetcher || ((url, opts) => fetchWithTimeout(url, { timeoutMs: 8000, ...(opts||{}) }));
  const now = new Date();

  const base = String(p.assetsBaseUrl || "");
  const domain = String(p.selectedDomainName || "");
  const computedDomainPrefix = base && domain ? join(base, domain + "/") : "";
  const activePrefix = String(p.domainAssetsPrefixActive || "");
  const primaryConfigUrl = computedDomainPrefix ? join(computedDomainPrefix, "config.yaml") : "";
  const defaultConfigUrl = "/domain_default/config.yaml";

  // HEAD first; if server blocks HEAD, fall back to GET (no-store)
  async function check(url) {
    if (!url) return { url, ok: false, status: 0, exists: false, text: null };
    let res;
    try {
      res = await fetcher(url, { method: "HEAD", cache: "no-store" });
      if (!res.ok && res.status !== 404) {
        // Try GET to get more clues
        res = await fetcher(url, { method: "GET", cache: "no-store" });
      }
      const exists = res.status !== 404 && res.ok;
      let text = null;
      if (exists && /\/config\.yaml$/i.test(url) && res.method !== "HEAD") {
        text = await res.text().catch(() => null);
      }
      return { url, ok: res.ok, status: res.status, exists, text };
    } catch (e) {
      return { url, ok: false, status: -1, exists: false, error: String(e) };
    }
  }

  const primary = primaryConfigUrl ? await check(primaryConfigUrl) : { url: primaryConfigUrl, ok: false, status: 0, exists: false };
  const fallback = await check(defaultConfigUrl);

  // Figure out which one the app thinks it's using, based on activePrefix/source
  const appConfigUrl = join(activePrefix, "config.yaml");

  // Extract key bits from parsed config available to the app
  const cfg = p.domainAssetsConfig || null;
  const logos = summarizeLogos(cfg);
  const hasLocales = !!(cfg && (cfg.locales || cfg.i18n));
  const hasTabs = !!(cfg && (cfg.tabs || cfg.ui?.tabs));
  const hasCategories = !!(cfg && (cfg.categories || cfg.ui?.categories));

  // Sample resolution checks for a couple of typical files, using the ACTIVE prefix
  const sampleFiles = [];
  if (logos.has) {
    // pick any first logo key
    const firstLogoKey = logos.pickable[0];
    const relPath = (typeof (cfg?.logos ?? cfg?.logo) === "string")
      ? (cfg?.logos ?? cfg?.logo)
      : (cfg?.logos?.[firstLogoKey] ?? cfg?.logo?.[firstLogoKey]);
    if (relPath) {
      sampleFiles.push({ kind: "logo", relPath });
    }
  }
  if (cfg?.locales?.length) {
    // pick first locale file path if present (structure may vary by project)
    const fr = cfg.locales.find(x => x?.path) || cfg.locales[0];
    if (fr?.path) sampleFiles.push({ kind: "locale", relPath: fr.path });
  }
  if (cfg?.tabs?.path) {
    sampleFiles.push({ kind: "tabs", relPath: cfg.tabs.path });
  }

  const resolvedSamples = await Promise.all(sampleFiles.map(async sf => {
    const url = join(activePrefix, sf.relPath);
    const r = await check(url);
    return { ...sf, url, ok: r.ok, status: r.status, exists: r.exists };
  }));

  // Assemble report
  return {
    timestamp: now.toISOString(),
    env: p.env || "prod",
    domain,
    assetsBaseUrl: base,
    computedDomainPrefix,
    activePrefix,
    appSource: p.domainAssetsSource || null,      // "remote" or "default"
    appConfigUrl,                                  // what the app would fetch given activePrefix
    primaryConfig: {
      url: primary.url,
      exists: !!primary.exists,
      status: primary.status,
      note: "ASSETS_BASE/DOMAIN/config.yaml",
    },
    defaultConfig: {
      url: fallback.url,
      exists: !!fallback.exists,
      status: fallback.status,
      note: "/domain_default/config.yaml",
    },
    appParsedConfigPresence: {
      hasConfigObject: !!cfg,
      hasLogos: !!logos.has,
      logoFields: logos.fields,
      hasLocales,
      hasTabs,
      hasCategories,
    },
    resolvedSamples,
  };
}
