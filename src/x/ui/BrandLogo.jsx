// src/x/ui/BrandLogo.jsx
import { createMemo, createSignal, onMount, onCleanup, Show, Switch, Match } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { navigate } from "../../routing/smartRouter.js";
import SvgImage from "./SvgImage.jsx";

export default function BrandLogo(props) {
  const app = useApp();
  const { t, domainAssetsConfig } = app;

  const urlFor = (rel) => {
    const fn = app.assetUrl;
    if (typeof fn === "function") return fn(rel);
    const prefix = typeof app.domainAssetsPrefix === "function" ? (app.domainAssetsPrefix() || "") : "";
    const relClean = String(rel || "").replace(/^\/+/, "");
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
  const hasLogoImage = createMemo(() => Boolean(src()));

  const isSvg = createMemo(() => src().toLowerCase().endsWith(".svg"));

  return (
    <a
      href="#"
      class="inline-flex items-center"
      classList={{ "no-underline": !hasLogoImage(), "hover:no-underline": !hasLogoImage() }}
      style={{ "text-decoration": hasLogoImage() ? undefined : "none" }}
      aria-label={t("brand.logoAlt")}
      onClick={(e) => {
        e.preventDefault();
        navigate("/");
      }}
    >
      <Show 
        when={hasLogoImage()} 
        fallback={<div class={props.classTitle || "text-xl font-bold select-none"}>{domainTitle()}</div>}
      >
        <Switch>
          <Match when={isSvg()}>
            <SvgImage
              src={src()}
              alt={domainTitle()}
              class={props.class || "h-8 w-auto"}
            />
          </Match>
          <Match when={!isSvg()}>
            <div class={`flex items-center justify-center overflow-hidden ${props.class || "h-8"}`}>
              <img
                src={src()}
                alt={domainTitle()}
                class="max-w-none max-h-none flex-shrink-0"
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            </div>
          </Match>
        </Switch>
      </Show>
    </a>
  );
}
