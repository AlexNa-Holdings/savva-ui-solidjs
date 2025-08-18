// src/theme/GoogleAnalyticsLoader.jsx
import { createEffect, onCleanup } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import { dbg } from "../utils/debug";

const SRC_ID  = "savva-ga-src";
const INIT_ID = "savva-ga-init";

function removeNode(id) {
  const el = document.getElementById(id);
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

export default function GoogleAnalyticsLoader() {
  const app = useApp();

  createEffect(() => {
    const cfg = app.domainAssetsConfig?.(); // parsed per-domain config.yaml
    const tag = String(cfg?.GA_tag || cfg?.ga_tag || "").trim();

    const prevSrc  = document.getElementById(SRC_ID);
    const prevInit = document.getElementById(INIT_ID);

    // If tag is empty → remove our scripts (if any) and stop.
    if (!tag) {
      if (prevSrc || prevInit) {
        removeNode(SRC_ID);
        removeNode(INIT_ID);
        dbg.log("analytics", "GA disabled (no tag in config)");
      }
      return;
    }

    // If already loaded for the same tag → nothing to do.
    if (prevSrc?.getAttribute("data-ga-id") === tag && prevInit?.getAttribute("data-ga-id") === tag) {
      return;
    }

    // Replace previous GA scripts if tag changed.
    removeNode(SRC_ID);
    removeNode(INIT_ID);

    // Load gtag.js
    const s1 = document.createElement("script");
    s1.id = SRC_ID;
    s1.async = true;
    s1.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tag)}`;
    s1.setAttribute("data-ga-id", tag);
    (document.head || document.documentElement).appendChild(s1);

    // Init + first config
    const s2 = document.createElement("script");
    s2.id = INIT_ID;
    s2.setAttribute("data-ga-id", tag);
    s2.text =
      `window.dataLayer = window.dataLayer || [];` +
      `function gtag(){dataLayer.push(arguments);} ` +
      `gtag('js', new Date()); ` +
      `gtag('config', '${tag}', { 'anonymize_ip': true });`;
    (document.head || document.documentElement).appendChild(s2);

    // Simple SPA page_view on hash route changes
    const onHash = () => {
      try {
        window.gtag && window.gtag('config', tag, { page_path: location.pathname + location.hash });
      } catch {}
    };
    window.addEventListener("hashchange", onHash);

    dbg.log("analytics", "GA enabled", { tag });

    // Clean the event handler when the effect re-runs
    onCleanup(() => {
      window.removeEventListener("hashchange", onHash);
    });
  });

  // Remove our scripts if component unmounts
  onCleanup(() => {
    removeNode(SRC_ID);
    removeNode(INIT_ID);
  });

  return null;
}
