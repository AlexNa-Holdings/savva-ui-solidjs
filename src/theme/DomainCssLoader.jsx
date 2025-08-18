// src/theme/DomainCssLoader.jsx
import { createEffect, onCleanup } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import { dbg } from "../utils/debug";

const LINK_ID = "savva-domain-css";

export default function DomainCssLoader() {
  const app = useApp();

  function ensureLink() {
    let el = document.getElementById(LINK_ID);
    if (!el) {
      el = document.createElement("link");
      el.id = LINK_ID;
      el.rel = "stylesheet";
      el.media = "all";
      (document.head || document.getElementsByTagName("head")[0]).appendChild(el);
    }
    return el;
  }

  createEffect(() => {
    const prefix = app.domainAssetsPrefix?.() || "";
    const cfg = app.domainAssetsConfig?.();
    const rev = `${prefix}|${cfg?.assets_cid || cfg?.cid || ""}`;
    const href = app.assetUrl?.("domain.css");
    const el = ensureLink();

    dbg.log("assets", "DomainCssLoader: applying domain.css", { href, prefix, rev });

    if (!href) {
      el.parentNode && el.parentNode.removeChild(el);
      return;
    }

    const nextHref = `${href}${href.includes("?") ? "&" : "?"}rev=${encodeURIComponent(rev)}`;
    if (el.getAttribute("href") === nextHref) return;

    el.setAttribute("href", nextHref);
    el.addEventListener("error", () => {
      dbg.warn("assets", "domain.css not found or failed", { href: nextHref, prefix });
      // If it 404s, base tokens from src/index.css continue to apply.
    }, { once: true });
    el.addEventListener("load", () => {
      dbg.log("assets", "domain.css applied", { href: nextHref, prefix });
    }, { once: true });
  });

  onCleanup(() => {
    const el = document.getElementById(LINK_ID);
    if (el?.parentNode) el.parentNode.removeChild(el);
  });

  return null;
}
