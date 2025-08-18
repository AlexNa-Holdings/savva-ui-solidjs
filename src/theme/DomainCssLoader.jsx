// src/theme/DomainCssLoader.jsx
import { createEffect, onCleanup, createMemo } from "solid-js";
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

  // Flip when env/domain/pack changes; used only for cache busting
  const rev = createMemo(() => {
    const cfg = app.domainAssetsConfig?.();
    const cid = cfg?.assets_cid || cfg?.cid || "";
    const env = app.assetsEnv?.() || "prod";
    const dom = (() => {
      const d = app.selectedDomain?.();
      return typeof d === "string" ? d : d?.name || "";
    })();
    return `${env}|${dom}|${cid}`;
  });

  createEffect(() => {
    const hrefBase = app.assetUrl?.("domain.css"); // <- single source of truth
    const el = ensureLink();

    if (!hrefBase) {
      el.parentNode && el.parentNode.removeChild(el);
      return;
    }

    const href = `${hrefBase}${hrefBase.includes("?") ? "&" : "?"}rev=${encodeURIComponent(rev())}`;
    if (el.getAttribute("href") === href) return;

    dbg.log("assets", "DomainCssLoader: applying domain.css", { hrefBase, href });

    const onLoad = () => dbg.log("assets", "domain.css loaded", { href });
    const onError = () => dbg.warn("assets", "domain.css failed to load", { href });

    el.addEventListener("load", onLoad, { once: true });
    el.addEventListener("error", onError, { once: true });
    el.setAttribute("href", href);
  });

  onCleanup(() => {
    const el = document.getElementById(LINK_ID);
    if (el?.parentNode) el.parentNode.removeChild(el);
  });

  return null;
}
