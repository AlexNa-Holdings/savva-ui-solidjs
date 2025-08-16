// src/components/ui/BrandLogo.jsx
/* src/components/ui/BrandLogo.jsx */
import { createMemo, createSignal, onMount, onCleanup, Show, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext";
import { dbg } from "../../utils/debug";

export default function BrandLogo(props) {
  const app = useApp();
  const { t, domainAssetsConfig, assetUrl } = app;

  // Single source of truth for the domain name (falls back to i18n brand name)
  const domainTitle = createMemo(() => {
    const fromCfg = app.config?.()?.domain?.trim();
    const fallback = t("brand.name");
    return fromCfg || (fallback && !/^\[.+\]$/.test(fallback) ? fallback : "SAVVA");
  });

  // Theme + mobile detection
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

  // logos from active domain assets config
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

  const src = createMemo(() => (relPath() ? assetUrl(relPath()) : ""));

  // 🔎 Debug: log whenever the chosen logo src changes
  createEffect(() => {
    const s = src();
    if (!s) return;
    dbg.log("logo", "BrandLogo src picked", {
      src: s,
      relPath: relPath(),
      dark: isDark(),
      mobile: isMobile(),
      domain: app.config?.()?.domain,
      activePrefix: app.domainAssetsPrefix?.(),
      source: app.domainAssetsSource?.(),
    });
  });

  const [imgBroken, setImgBroken] = createSignal(false);
  // reset broken flag whenever src changes
  createMemo(() => { src(); setImgBroken(false); });

  return (
    <div class="flex items-center">
      <Show when={src() && !imgBroken()} fallback={
        <span class={props.classTitle || "text-xl font-bold"}>{domainTitle()}</span>
      }>
        <img
          src={src()}
          alt={t("brand.logoAlt", { domain: domainTitle() })}
          class={props.class || "h-8 w-auto"}
          decoding="async"
          loading="eager"
          onError={() => {
            dbg.log("logo", "BrandLogo image failed to load", { src: src(), relPath: relPath() });
            setImgBroken(true);
          }}
        />
      </Show>
    </div>
  );
}
