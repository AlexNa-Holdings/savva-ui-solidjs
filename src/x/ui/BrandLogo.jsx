// src/x/ui/BrandLogo.jsx
import { createMemo, createSignal, onMount, onCleanup, Show, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { dbg } from "../../utils/debug.js";
import { navigate } from "../../routing/hashRouter.js";

export default function BrandLogo(props) {
  const app = useApp();
  const { t, domainAssetsConfig } = app;

  // Resolve asset URL function defensively
  const urlFor = (rel) => {
    const fn = app.assetUrl;
    if (typeof fn === "function") return fn(rel);
    const prefix = typeof app.domainAssetsPrefix === "function" ? (app.domainAssetsPrefix() || "") : "";
    const relClean = String(rel || "").replace(/^\/+/, "");
    dbg.warn("BrandLogo", "app.assetUrl is not a function; using prefix fallback", {
      typeof_assetUrl: typeof fn,
      prefix,
      rel: relClean,
    });
    return prefix + relClean;
  };

  const domainTitle = createMemo(() => {
    const fromCfg = app.config?.()?.domain?.trim();
    const fallback = t("brand.name");
    return fromCfg || (fallback && !/^\[.+\]$/.test(fallback) ? fallback : "SAVVA");
  });

  const [isDark, setIsDark] = createSignal(false);
  const [isMobile, setIsMobile] = createSignal(false);
  onMount(() => {
    const el = document.documentElement;
    const updateDark = () => setIsDark(el.classList.contains("dark"));
    updateDark();
    const mo = new MutationObserver(updateDark);
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });

    const mql = window.matchMedia("(max-width: 640px)");
    const onMQ = (e) => setIsMobile(!!e.matches);
    onMQ(mql);
    mql.addEventListener ? mql.addEventListener("change", onMQ) : mql.addListener(onMQ);

    onCleanup(() => {
      mo.disconnect();
      mql.removeEventListener ? mql.removeEventListener("change", onMQ) : mql.removeListener(onMQ);
    });
  });

  const logos = createMemo(() => {
    const cfg = domainAssetsConfig?.();
    const raw = cfg?.logos ?? cfg?.logo ?? null;
    if (!raw) return null;
    if (typeof raw === "string") return { default: raw };
    return {
      dark_mobile:  raw.dark_mobile  ?? raw.mobile_dark  ?? null,
      light_mobile: raw.light_mobile ?? raw.mobile_light ?? null,
      mobile:       raw.mobile       ?? null,
      dark:         raw.dark         ?? null,
      light:        raw.light        ?? null,
      default:      raw.default      ?? raw.fallback     ?? null,
    };
  });

  const relPath = createMemo(() => {
    const l = logos();
    if (!l) return "";
    const dark = isDark();
    const mobile = isMobile();
    const order = dark
      ? (mobile ? [l.dark_mobile, l.dark, l.mobile, l.default, l.light] : [l.dark, l.default, l.light, l.mobile])
      : (mobile ? [l.light_mobile, l.light, l.mobile, l.default, l.dark] : [l.light, l.default, l.dark, l.mobile]);
    return order.find(Boolean) || "";
  });

  const src = createMemo(() => (relPath() ? urlFor(relPath()) : ""));

  createEffect(() => {
    const s = src();
    if (!s) return;
    dbg.log("logo", "BrandLogo src picked", {
      src: s,
      relPath: relPath(),
      dark: isDark(),
      mobile: isMobile(),
      domain: app.config?.()?.domain,
      activePrefix: typeof app.domainAssetsPrefix === "function" ? app.domainAssetsPrefix() : undefined,
      source: typeof app.domainAssetsSource === "function" ? app.domainAssetsSource() : undefined,
    });
  });

  return (
    <a href="#" aria-label={t("brand.logoAlt")} onClick={(e) => { e.preventDefault(); navigate("/"); }}>
      <Show when={src()} fallback={<div class="text-xl font-bold select-none">SAVVA</div>}>
        <img
          src={src()}
          alt={domainTitle()}
          class={props.class || "h-8 w-auto"}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      </Show>
    </a>
  );
}
