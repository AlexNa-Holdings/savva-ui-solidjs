// src/components/ui/BrandLogo.jsx
import { createSignal, createMemo, onMount, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext";
import { useI18n } from "../../i18n/useI18n";

// Conventional defaults for the shared "domain_default" asset pack
const DEFAULT_LOGOS = {
  light: "images/logo_light.png",
  dark: "images/logo_dark.png",
  light_mobile: "images/logo_light.png",
  dark_mobile: "images/logo_dark.png",
};

export default function BrandLogo(props) {
  const { domainAssetsConfig, assetUrl, selectedDomain, t } = useApp();
  const { lang } = useI18n();

  // Track theme and a simple mobile breakpoint
  const [isDark, setIsDark] = createSignal(
    typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
  );
  const [isMobile, setIsMobile] = createSignal(
    typeof window !== "undefined" &&
      window.matchMedia("(max-width: 640px)").matches
  );

  onMount(() => {
    const root = document.documentElement;
    const mo = new MutationObserver(() => setIsDark(root.classList.contains("dark")));
    mo.observe(root, { attributes: true, attributeFilter: ["class"] });

    const mq = window.matchMedia("(max-width: 640px)");
    const mqHandler = (e) => setIsMobile(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", mqHandler);
    else mq.addListener && mq.addListener(mqHandler);

    onCleanup(() => {
      mo.disconnect();
      if (mq.removeEventListener) mq.removeEventListener("change", mqHandler);
      else mq.removeListener && mq.removeListener(mqHandler);
    });
  });

  const domainName = createMemo(() => {
    const d = selectedDomain?.();
    if (!d) return "";
    return typeof d === "string" ? d : d.name || "";
  });

  // Detect if the active domain actually provides its own logo set
  const hasDomainLogos = (cfg) =>
    !!cfg?.logo &&
    (cfg.logo.light || cfg.logo.dark || cfg.logo.light_mobile || cfg.logo.dark_mobile);

  const activeCfg = createMemo(() => domainAssetsConfig?.() || null);
  const usingDefaultPack = createMemo(() => !hasDomainLogos(activeCfg()));

  // Effective config: domain’s if present; else synthetic default pack
  const effectiveCfg = createMemo(() => {
    const cfg = activeCfg();
    if (hasDomainLogos(cfg)) return cfg;
    return { logo: DEFAULT_LOGOS, default_locale: "en", locales: [] };
  });

  const domainTitle = createMemo(() => {
    const cfg = effectiveCfg();
    const cur = (typeof lang === "function" ? lang() : lang) || cfg?.default_locale || "en";
    const locales = Array.isArray(cfg?.locales) ? cfg.locales : [];
    const byLang = locales.find((l) => l?.code === cur)?.title;
    const byDefault = cfg?.default_locale
      ? locales.find((l) => l?.code === cfg.default_locale)?.title
      : null;
    return byLang || byDefault || domainName() || t("brand.defaultName");
  });

  // Choose the best logo key
  const logoPath = createMemo(() => {
    const logos = effectiveCfg()?.logo;
    if (!logos) return null;

    if (isDark()) {
      if (isMobile() && logos.dark_mobile) return logos.dark_mobile;
      if (logos.dark) return logos.dark;
    } else {
      if (isMobile() && logos.light_mobile) return logos.light_mobile;
      if (logos.light) return logos.light;
    }
    return null;
  });

  // Final URL:
  // - default pack → "/domain_default/<rel>"
  // - domain pack  → assetUrl(rel)
  const src = createMemo(() => {
    const rel = logoPath();
    if (!rel) return null;
    const clean = String(rel).replace(/^\/+/, "");

    if (usingDefaultPack()) {
      return `/domain_default/${clean}`;
    }

    try {
      const url = assetUrl ? assetUrl(rel) : undefined;
      if (typeof url === "string" && url.trim()) return url;
    } catch {
      // ignore and fall through
    }
    // If assetUrl misbehaves, still serve something sensible from default pack:
    return `/domain_default/${clean}`;
  });

  return src() ? (
    <img
      src={src()}
      alt={t("brand.logoAlt", { domain: domainTitle() })}
      class={props.class || "h-6 sm:h-7"}
      decoding="async"
      loading="eager"
      fetchpriority="high"
    />
  ) : (
    <span class={props.classTitle || "text-xl font-semibold"}>{domainTitle()}</span>
  );
}
