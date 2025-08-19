// src/utils/assetsDiagnostics.js
// Utility to assess domain asset resources and common pitfalls.

import { fetchWithTimeout } from "./net";

function join(base, rel) {
  const b = base?.endsWith("/") ? base : (base || "") + "/";
  const r = String(rel || "").replace(/^\/+/, "");
  return b + r;
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

export async function assessAssets(p) {
  const fetcher = p.fetcher || ((url, opts) => fetchWithTimeout(url, { timeoutMs: 8000, ...(opts || {}) }));
  const base = String(p.assetsBaseUrl || "");
  const domain = String(p.selectedDomainName || "");
  const computedDomainPrefix = base && domain ? join(base, domain + "/") : "";
  const activePrefix = String(p.domainAssetsPrefixActive || "");
  const primaryConfigUrl = computedDomainPrefix ? join(computedDomainPrefix, "config.yaml") : "";
  const defaultConfigUrl = "/domain_default/config.yaml";

  async function check(url) {
    if (!url) return { url, ok: false, status: 0, exists: false, error: null };
    let res, method = "HEAD";
    try {
      res = await fetcher(url, { method, cache: "no-store" });
    } catch (e) {
      try { method = "GET"; res = await fetcher(url, { method, cache: "no-store" }); }
      catch (e2) { return { url, ok: false, status: -1, exists: false, error: String(e2) }; }
    }
    if (method === "HEAD" && !res.ok && res.status !== 404) {
      try { method = "GET"; res = await fetcher(url, { method, cache: "no-store" }); }
      catch (e3) { return { url, ok: false, status: -1, exists: false, error: String(e3) }; }
    }
    const exists = res.ok && res.status !== 404;
    return { url, ok: res.ok, status: res.status, exists, error: null };
  }

  const primary = primaryConfigUrl ? await check(primaryConfigUrl) : { url: primaryConfigUrl, ok: false, status: 0, exists: false };
  const fallback = await check(defaultConfigUrl);

  const appConfigUrl = join(activePrefix, "config.yaml");

  const cfg = p.domainAssetsConfig || null;
  const logos = summarizeLogos(cfg);
  const hasLocales    = !!(cfg && (cfg.locales || cfg.i18n));
  const hasTabs       = !!(cfg && (cfg.modules?.tabs || cfg.tabs || cfg.ui?.tabs));            // fixed
  const hasCategories = !!(cfg && (cfg.modules?.categories || cfg.categories || cfg.ui?.categories)); // fixed

  const fav = cfg?.favicon || null;
  const hasFavicon = !!(fav && (fav.base || fav["16"] || fav["32"] || fav["apple-touch-icon"] || fav.manifest || fav["mask-icon"]?.href));

  const sampleFiles = [];
  if (logos.has) {
    const key = logos.pickable[0];
    const rel = (typeof (cfg?.logos ?? cfg?.logo) === "string")
      ? (cfg?.logos ?? cfg?.logo)
      : (cfg?.logos?.[key] ?? cfg?.logo?.[key]);
    if (rel) sampleFiles.push({ kind: "logo", relPath: rel });
  }
  if (cfg?.locales?.length) {
    const fr = cfg.locales.find(x => x?.path || x?.dictionary) || cfg.locales[0];
    const rel = fr?.path || fr?.dictionary;
    if (rel) sampleFiles.push({ kind: "locale", relPath: rel });
  }
  if (cfg?.modules?.tabs || cfg?.tabs?.path) {
    const rel = cfg?.modules?.tabs || cfg?.tabs?.path;
    sampleFiles.push({ kind: "tabs", relPath: rel });
  }
  if (hasFavicon) {
    const favRel = fav["32"] || fav["16"] || fav.base || fav["apple-touch-icon"] || fav.manifest || fav["mask-icon"]?.href;
    if (favRel) sampleFiles.push({ kind: "favicon", relPath: favRel });
  }

  const resolvedSamples = await Promise.all(sampleFiles.map(async (sf) => {
    const url = join(activePrefix, sf.relPath);
    const r = await check(url);
    return { ...sf, url, exists: r.exists, status: r.status };
  }));

  return {
    env: p.env || "prod",
    domain,
    assetsBaseUrl: base,
    computedDomainPrefix,
    activePrefix,
    appSource: p.domainAssetsSource || null,
    appConfigUrl,                   // active pack’s config (may be /domain_default/)
    primaryConfig: { url: primary.url, exists: !!primary.exists, status: primary.status, error: primary.error },
    defaultConfig: { url: fallback.url, exists: !!fallback.exists, status: fallback.status },
    appParsedConfigPresence: {
      hasConfigObject: !!cfg,
      hasLogos: !!logos.has, logoFields: logos.fields,
      hasLocales, hasTabs, hasCategories, hasFavicon
    },
    resolvedSamples,
  };
}
