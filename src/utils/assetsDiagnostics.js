/* src/utils/assetsDiagnostics.js */
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
    dark_mobile:  raw.dark_mobile  ?? raw.mobile_dark  ?? null,
    light_mobile: raw.light_mobile ?? raw.mobile_light ?? null,
    mobile:       raw.mobile ?? null,
    dark:         raw.dark   ?? null,
    light:        raw.light  ?? null,
    default:      raw.default?? raw.fallback ?? null,
  };
  const fields = Object.entries(l).filter(([,v]) => !!v).map(([k]) => k);
  return { has: fields.length > 0, fields, pickable: fields };
}

/**
 * assessAssets
 * @param {object} p
 * @param {string} p.env 'prod' | 'test'
 * @param {string} p.assetsBaseUrl
 * @param {string} p.selectedDomainName
 * @param {string} p.domainAssetsPrefixActive
 * @param {object|null} p.domainAssetsConfig
 * @param {'remote'|'default'|null} p.domainAssetsSource
 * @param {(url: string, opts?: any) => Promise<Response>} [p.fetcher]
 */
export async function assessAssets(p) {
  const fetcher = p.fetcher || ((url, opts) => fetchWithTimeout(url, { timeoutMs: 8000, ...(opts || {}) }));
  const now = new Date();

  const base = String(p.assetsBaseUrl || "");
  const domain = String(p.selectedDomainName || "");
  const computedDomainPrefix = base && domain ? join(base, domain + "/") : "";
  const activePrefix = String(p.domainAssetsPrefixActive || "");
  const primaryConfigUrl = computedDomainPrefix ? join(computedDomainPrefix, "config.yaml") : "";
  const defaultConfigUrl = "/domain_default/config.yaml";

  // Robust HEAD -> GET check that handles CORS/network failures
  async function check(url) {
    if (!url) return { url, ok: false, status: 0, exists: false, text: null };
    let res, method = "HEAD";

    // Try HEAD
    try {
      res = await fetcher(url, { method: "HEAD", cache: "no-store" });
    } catch {
      // HEAD failed (CORS/network) → try GET
      try {
        method = "GET";
        res = await fetcher(url, { method, cache: "no-store" });
      } catch (e2) {
        return { url, ok: false, status: -1, exists: false, error: String(e2) };
      }
    }

    // If HEAD returned non‑OK and not 404, try GET too
    if (method === "HEAD" && !res.ok && res.status !== 404) {
      try {
        method = "GET";
        res = await fetcher(url, { method, cache: "no-store" });
      } catch (e3) {
        return { url, ok: false, status: -1, exists: false, error: String(e3) };
      }
    }

    const exists = res.status !== 404 && res.ok;
    let text = null;
    if (exists && /\/config\.yaml$/i.test(url) && method === "GET") {
      text = await res.text().catch(() => null);
    }
    return { url, ok: res.ok, status: res.status, exists, text };
  }

  const primary = primaryConfigUrl
    ? await check(primaryConfigUrl)
    : { url: primaryConfigUrl, ok: false, status: 0, exists: false };

  const fallback = await check(defaultConfigUrl);

  const appConfigUrl = join(activePrefix, "config.yaml");

  const cfg = p.domainAssetsConfig || null;
  const logos = summarizeLogos(cfg);
  const hasLocales    = !!(cfg && (cfg.locales || cfg.i18n));
  const hasTabs       = !!(cfg && (cfg.tabs || cfg.ui?.tabs));
  const hasCategories = !!(cfg && (cfg.categories || cfg.ui?.categories));

  // Sample resolution checks using ACTIVE prefix
  const sampleFiles = [];
  if (logos.has) {
    const firstLogoKey = logos.pickable[0];
    const relPath = (typeof (cfg?.logos ?? cfg?.logo) === "string")
      ? (cfg?.logos ?? cfg?.logo)
      : (cfg?.logos?.[firstLogoKey] ?? cfg?.logo?.[firstLogoKey]);
    if (relPath) sampleFiles.push({ kind: "logo", relPath });
  }
  if (cfg?.locales?.length) {
    const fr = cfg.locales.find(x => x?.path) || cfg.locales[0];
    if (fr?.path) sampleFiles.push({ kind: "locale", relPath: fr.path });
  }
  if (cfg?.tabs?.path) sampleFiles.push({ kind: "tabs", relPath: cfg.tabs.path });

  const resolvedSamples = await Promise.all(sampleFiles.map(async sf => {
    const url = join(activePrefix, sf.relPath);
    const r = await check(url);
    return { ...sf, url, ok: r.ok, status: r.status, exists: r.exists };
  }));

  return {
    timestamp: now.toISOString(),
    env: p.env || "prod",
    domain,
    assetsBaseUrl: base,
    computedDomainPrefix,
    activePrefix,
    appSource: p.domainAssetsSource || null,
    appConfigUrl,
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
