// src/theme/FaviconLoader.jsx
import { createEffect, onCleanup } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import { dbg } from "../utils/debug";

const ID = {
  apple:   "savva-fav-apple",
  icon16:  "savva-fav-16",
  icon32:  "savva-fav-32",
  base:    "savva-fav-base",
  manifest:"savva-fav-manifest",
  mask:    "savva-fav-mask",
};

function ensureHeadEl(tag, id) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement(tag);
    el.id = id;
    el.setAttribute("data-savva", "1");
    (document.head || document.getElementsByTagName("head")[0]).appendChild(el);
  }
  return el;
}
function removeEl(id) {
  const el = document.getElementById(id);
  if (el?.parentNode) el.parentNode.removeChild(el);
}

function setOrRemoveLink(id, rel, href, attrs = {}) {
  if (!href) return removeEl(id);
  const el = ensureHeadEl("link", id);
  el.setAttribute("rel", rel);
  el.setAttribute("href", href);
  // clean attrs we may set
  ["sizes", "type", "color", "crossorigin"].forEach((a) => el.removeAttribute(a));
  Object.entries(attrs).forEach(([k, v]) => v != null && el.setAttribute(k, v));
}

function slugMetaId(name) {
  return "savva-meta-" + String(name || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}
function setOrRemoveMeta(name, content) {
  const id = slugMetaId(name);
  if (!content) return removeEl(id);
  const el = ensureHeadEl("meta", id);
  el.setAttribute("name", name);
  el.setAttribute("content", content);
}

export default function FaviconLoader() {
  const app = useApp();

  createEffect(() => {
    const prefix = app.domainAssetsPrefix?.() || "";
    const cfg    = app.domainAssetsConfig?.();
    const fav    = cfg?.favicon || null;
    const revKey = `${prefix}|${cfg?.assets_cid || cfg?.cid || ""}`;

    const withRev = (relPath) => {
      if (!relPath) return "";
      const abs = app.assetUrl?.(relPath);
      if (!abs) return "";
      return `${abs}${abs.includes("?") ? "&" : "?"}rev=${encodeURIComponent(revKey)}`;
    };

    // Resolve all hrefs up front
    const hrefs = {
      apple:    fav?.["apple-touch-icon"] ? withRev(fav["apple-touch-icon"]) : "",
      icon16:   fav?.["16"] ? withRev(fav["16"]) : "",
      icon32:   fav?.["32"] ? withRev(fav["32"]) : "",
      base:     fav?.base ? withRev(fav.base) : "",
      manifest: fav?.manifest ? withRev(fav.manifest) : "",
      mask:     fav?.["mask-icon"]?.href ? withRev(fav["mask-icon"].href) : "",
    };

    dbg.log("assets", "FaviconLoader → apply", {
      prefix, revKey,
      hasFavConfig: !!fav,
      hrefs,
    });

    // Links
    setOrRemoveLink(ID.apple, "apple-touch-icon", hrefs.apple);
    setOrRemoveLink(ID.icon16, "icon", hrefs.icon16, { sizes: "16x16", type: "image/png" });
    setOrRemoveLink(ID.icon32, "icon", hrefs.icon32, { sizes: "32x32", type: "image/png" });
    setOrRemoveLink(ID.base,   "icon", hrefs.base,   { type: "image/x-icon" });
    setOrRemoveLink(ID.manifest, "manifest", hrefs.manifest);
    setOrRemoveLink(ID.mask, "mask-icon", hrefs.mask, { color: fav?.["mask-icon"]?.color || undefined });

    // Meta (generic list; we only manage our own <meta> with data-savva/id)
    const metaList = Array.isArray(fav?.meta) ? fav.meta : [];
    const keepIds = new Set();
    metaList.forEach((m) => {
      if (m && m.name && m.content != null) {
        setOrRemoveMeta(m.name, String(m.content));
        keepIds.add(slugMetaId(m.name));
      }
    });
    // Remove any previous managed meta not present anymore
    const prevManaged = Array.from(document.querySelectorAll('meta[id^="savva-meta-"][data-savva="1"]'));
    prevManaged.forEach((el) => { if (!keepIds.has(el.id)) el.parentNode?.removeChild(el); });

    // If there’s no favicon section at all, drop our managed nodes and keep index.html default
    if (!fav) {
      Object.values(ID).forEach(removeEl);
      prevManaged.forEach((el) => el.parentNode?.removeChild(el));
    }
  });

  onCleanup(() => {
    // Remove the nodes we manage (so a different shell can take over if unmounted)
    Object.values(ID).forEach(removeEl);
    const prevManaged = Array.from(document.querySelectorAll('meta[id^="savva-meta-"][data-savva="1"]'));
    prevManaged.forEach((el) => el.parentNode?.removeChild(el));
  });

  return null;
}
