// src/lib/seo/canonical.js
//
// Helpers to build canonical URLs that match the backend's seo package
// conventions. The default-locale URL has no ?lang=; non-default locales
// get ?lang=xx. Site name mirrors backend seo.SiteName() (domain.Website
// verbatim, hostname-only).

const norm = (c) => String(c || "").trim().toLowerCase().split(/[-_]/)[0];

export function getDefaultLocale(app) {
  const cfg = app.domainAssetsConfig?.() || {};
  const fromCfg = cfg.default_locale || cfg.locales?.[0]?.code;
  return norm(fromCfg || "en");
}

export function getCanonicalBase(app) {
  const dom = app.selectedDomain?.();
  const website = (dom && typeof dom === "object" ? dom.website : "") || "";
  if (website) return website.replace(/\/+$/, "");
  const name = app.selectedDomainName?.() || "";
  if (name) return `https://${name.replace(/\/+$/, "")}`;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

// Mirror backend seo.SiteName(): return the hostname as configured.
export function getSiteName(app) {
  const dom = app.selectedDomain?.();
  const website = (dom && typeof dom === "object" ? dom.website : "") || "";
  if (website) {
    return website.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }
  return app.selectedDomainName?.() || "";
}

export function buildCanonical(app, path, lang) {
  const base = getCanonicalBase(app);
  if (!base || !path) return "";
  const def = getDefaultLocale(app);
  const cur = norm(lang);
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const suffix = cur && cur !== def ? `?lang=${cur}` : "";
  return `${base}${cleanPath}${suffix}`;
}

// Resolve an IPFS path/CID to a public HTTP URL using the first configured
// remote gateway. activeIpfsGateways() can include a localhost gateway when
// the user runs a local node — useless for og:image, so we use remote only.
export function ipfsPublicUrl(app, pathOrCid) {
  if (!pathOrCid) return "";
  if (/^https?:\/\//i.test(pathOrCid)) return pathOrCid;
  const gateways = app.remoteIpfsGateways?.() || [];
  if (gateways.length === 0) return "";
  const clean = pathOrCid.startsWith("/") ? pathOrCid.slice(1) : pathOrCid;
  return `${gateways[0]}${clean}`;
}

// Truncate description to a reasonable og:description length without
// breaking mid-word. Returns "" for empty input.
export function truncateDescription(text, max = 200) {
  if (!text) return "";
  const flat = String(text).replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}
