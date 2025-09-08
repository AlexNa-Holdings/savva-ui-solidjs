// src/x/navigation/NavigationPanel.jsx
import { createEffect, createMemo, createResource, createSignal, For, Show, onCleanup, onMount } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { loadAssetResource } from "../../utils/assetLoader.js";
import { navigate, useHashRouter } from "../../routing/hashRouter.js";
import LibraryIcon from "../ui/icons/LibraryIcon.jsx";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";

const STORAGE_KEY = "sv:leftnav:pinned";
const HEADER_H = 48; // keep in sync with header
const W = "clamp(240px, 20vw, 300px)";
const EDGE = "22px";

const slug = (s) => String(s || "").trim().toLowerCase();
const pathFor = (idOrType) => `/${encodeURIComponent(slug(idOrType)) || ""}`;

// Minimal icons for tabs
function SvgIcon(props) {
  return (
    <svg viewBox="0 0 24 24" class={props.class || "w-4 h-4"} fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {props.children}
    </svg>
  );
}
const TrophyIcon   = () => <SvgIcon><path d="M8 21h8M12 17v4M7 4h10M7 8a5 5 0 0010 0M7 4a4 4 0 01-4 4M17 4a4 4 0 004 4"/></SvgIcon>;
const BoltIcon     = () => <SvgIcon><path d="M13 2L3 14h6l-2 8 10-12h-6l2-8z"/></SvgIcon>;
const CommentIcon  = () => <SvgIcon><path d="M4 6h16v8a4 4 0 01-4 4h-3l-4 3v-3H8a4 4 0 01-4-4z"/></SvgIcon>;
const SparklesIcon = () => <SvgIcon><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5zM6 16l.8 2.2L9 19l-2.2.8L6 22l-.8-2.2L3 19l2.2-.8z"/></SvgIcon>;
const HeartIcon    = () => <SvgIcon><path d="M12 21s-8-7-8-13a5 5 0 019-3 5 5 0 019 3c0 6-8 13-8 13z"/></SvgIcon>;
const FallbackIcon = () => <SvgIcon><path d="M4 6h16v12H4zM8 10h8M8 14h5"/></SvgIcon>;
function iconFor(type) {
  const k = slug(type);
  if (k === "leaders") return <TrophyIcon />;
  if (k === "actual") return <BoltIcon />;
  if (k === "comments") return <CommentIcon />;
  if (k === "new") return <SparklesIcon />;
  if (k === "for-you" || k === "foryou") return <HeartIcon />;
  return <FallbackIcon />;
}

export default function NavigationPanel(props) {
  const app = useApp();
  const { t } = app;
  const { route } = useHashRouter();
  const isDesktop = useMediaQuery("(min-width: 1280px)");

  const [pinned, setPinned] = createSignal(false);
  const [isHovering, setIsHovering] = createSignal(false);

  const tabsPath = createMemo(() => app.domainAssetsConfig?.()?.modules?.tabs || "modules/tabs.yaml");
  const [tabs] = createResource(
    () => tabsPath(),
    async (rel) => {
      if (!rel) return [];
      const data = (await loadAssetResource(app, rel, { type: "yaml" })) || {};
      const list = Array.isArray(data) ? data : Array.isArray(data.tabs) ? data.tabs : [];
      return list.map((x, i) => ({
        id: x?.id ?? x?.type ?? `tab_${i}`,
        type: x?.type ?? x?.id ?? `tab_${i}`,
        labelKey: `tabs.title.${slug(x?.type ?? x?.id)}`,
        _raw: x,
      }));
    }
  );

  const activeKey = () => {
    const r = String(route() || "/");
    const s = r.startsWith("/") ? r.slice(1) : r;
    return s.split(/[?#/]/, 1)[0] || "";
  };

  function go(tab) {
    const p = pathFor(tab.type || tab.id);
    if (route() !== p) navigate(p);
    if (!isDesktop()) props.onMobileNavClose?.();
  }

  onMount(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) || "") === "1";
    setPinned(saved);
    document.documentElement.classList.toggle("sv-leftnav-pinned", saved && isDesktop());
    document.documentElement.style.setProperty("--sv-leftnav-w", W);
    document.documentElement.style.setProperty("--sv-leftnav-edge", EDGE);
    document.documentElement.style.setProperty("--sv-header-h", `${HEADER_H}px`);
  });

  createEffect(() => {
    const p = pinned() && isDesktop();
    try { localStorage.setItem(STORAGE_KEY, p ? "1" : "0"); } catch {}
    document.documentElement.classList.toggle("sv-leftnav-pinned", p);
  });

  onCleanup(() => {
    document.documentElement.classList.remove("sv-leftnav-pinned");
  });

  return (
    <>
      <aside
        class="sv-leftnav"
        classList={{
          "is-pinned": pinned() && isDesktop(),
          "is-hovering": isHovering() && isDesktop(),
          "is-open": props.isMobileOpen && !isDesktop()
        }}
        role="complementary"
        aria-label={t("nav.left.label")}
        onMouseLeave={() => setIsHovering(false)}
      >
        <Show when={isDesktop()}>
          <div class="sv-leftnav__edge-top" onMouseEnter={(e) => e.stopPropagation()}>
            <button
              type="button"
              class="sv-leftnav__pin"
              onClick={() => setPinned((v) => !v)}
              onMouseEnter={(e) => e.stopPropagation()}
              aria-pressed={pinned() ? "true" : "false"}
              aria-label={pinned() ? t("nav.unpin") : t("nav.pin")}
              title={pinned() ? t("nav.unpin") : t("nav.pin")}
            >
              <LibraryIcon class="w-5 h-5" />
            </button>
          </div>

          <div
            class="sv-leftnav__edge-bottom"
            onMouseEnter={() => setIsHovering(true)}
          />
        </Show>

        <nav class="sv-leftnav__scroll">
          <div class="sv-leftnav__section">
            <div class="sv-leftnav__sectionTitle">{t("nav.section.main")}</div>
            <ul class="sv-leftnav__list">
              <For each={tabs()}>
                {(tab) => {
                  const isActive = () => slug(tab.type) === slug(activeKey());
                  return (
                    <li>
                      <a
                        href={`#${pathFor(tab.type)}`}
                        onClick={(e) => { e.preventDefault(); go(tab); }}
                        class="sv-leftnav__item"
                        classList={{ "is-active": isActive() }}
                        aria-current={isActive() ? "page" : undefined}
                        title={t(tab.labelKey) || t("main.tabs.untitled")}
                      >
                        <span class="sv-leftnav__icon">{iconFor(tab.type)}</span>
                        <span class="sv-leftnav__label">{t(tab.labelKey) || t("main.tabs.untitled")}</span>
                      </a>
                    </li>
                  );
                }}
              </For>
              <Show when={tabs.error}>
                <li class="sv-leftnav__error">{t("common.error")}</li>
              </Show>
            </ul>
          </div>
        </nav>
      </aside>
      <Show when={props.isMobileOpen && !isDesktop()}>
        <div class="fixed inset-0 z-20 bg-black/40" onClick={props.onMobileNavClose} />
      </Show>
    </>
  );
}

