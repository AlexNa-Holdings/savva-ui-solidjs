// src/x/navigation/NavigationPanel.jsx
import { createEffect, createMemo, createResource, createSignal, For, Show, onCleanup, onMount } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { loadAssetResource } from "../../utils/assetLoader.js";
import { navigate, useHashRouter } from "../../routing/hashRouter.js";
import LibraryIcon from "../ui/icons/LibraryIcon.jsx";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { tabIconFor } from "../ui/icons/TabIcons.jsx";
import CategoryBrowser from "./CategoryBrowser.jsx";

const STORAGE_KEY = "sv:leftnav:pinned";
const HEADER_H = 48; // keep in sync with header
const W = "clamp(240px, 20vw, 300px)";
const EDGE = "22px";

const slug = (s) => String(s || "").trim().toLowerCase();
const pathFor = (idOrType) => `/${encodeURIComponent(slug(idOrType)) || ""}`;

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
    document.documentElement.classList.toggle("sv-leftnav-pinned", saved);
    document.documentElement.style.setProperty("--sv-leftnav-w", W);
    document.documentElement.style.setProperty("--sv-leftnav-edge", EDGE);
    document.documentElement.style.setProperty("--sv-header-h", `${HEADER_H}px`);
  });

  createEffect(() => {
    const p = pinned();
    try { localStorage.setItem(STORAGE_KEY, p ? "1" : "0"); } catch {}
    document.documentElement.classList.toggle("sv-leftnav-pinned", p);
  });

  onCleanup(() => {
    document.documentElement.classList.remove("sv-leftnav-pinned");
  });

  const shouldBeVisible = createMemo(() => {
    if (isDesktop()) return true;
    return props.isMobileOpen;
  });

  return (
    <Show when={shouldBeVisible()}>
      <aside
        class="sv-leftnav"
        classList={{
          "is-pinned": pinned() && isDesktop(),
          "is-hovering": isHovering() && isDesktop(),
          "sv-leftnav--mobile": !isDesktop(),
          "is-open": props.isMobileOpen
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
              aria-pressed={pinned() ? "true" : "false"}
              aria-label={pinned() ? t("nav.unpin") : t("nav.pin")}
              title={pinned() ? t("nav.unpin") : t("nav.pin")}
              onMouseEnter={(e) => e.stopPropagation()}
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
                        <span class="sv-leftnav__icon">{tabIconFor(tab.type)}</span>
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
          <CategoryBrowser onNavigate={!isDesktop() ? props.onMobileNavClose : undefined} />
        </nav>
      </aside>
      <Show when={props.isMobileOpen}>
        <div class="fixed inset-0 z-20 bg-black/40" onClick={props.onMobileNavClose} />
      </Show>
    </Show>
  );
}