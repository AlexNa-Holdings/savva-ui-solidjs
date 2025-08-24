// src/components/main/TabsBar.jsx
import { createResource, Show, createMemo, createSignal, createEffect, batch, For } from "solid-js";
import { useApp } from "../../context/AppContext";
import { useI18n } from "../../i18n/useI18n";
import { loadAssetResource } from "../../utils/assetLoader";
import { useHashRouter, navigate } from "../../routing/hashRouter";
import Tabs from "../ui/Tabs.jsx";
import { getTabComponent } from "../tabs";
import RightRailLayout from "../tabs/RightRailLayout.jsx";
import TabPanelScaffold from "../tabs/TabPanelScaffold.jsx";

const slug = (s) => String(s || "").trim().toLowerCase();
const firstSeg = (path) => {
  const p = String(path || "/");
  const s = p.startsWith("/") ? p.slice(1) : p;
  return s.split(/[?#/]/, 1)[0] || "";
};
const pathFor = (idOrType) => `/${encodeURIComponent(slug(idOrType)) || ""}`;

function SvgIcon(props) {
  return (
    <svg viewBox="0 0 24 24" class={props.class || "w-4 h-4"} fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {props.children}
    </svg>
  );
}
const TrophyIcon = () => <SvgIcon><path d="M8 21h8M12 17v4M7 4h10M7 8a5 5 0 0010 0M7 4a4 4 0 01-4 4M17 4a4 4 0 004 4"/></SvgIcon>;
const BoltIcon = () => <SvgIcon><path d="M13 2L3 14h6l-2 8 10-12h-6l2-8z"/></SvgIcon>;
const CommentIcon = () => <SvgIcon><path d="M4 6h16v8a4 4 0 01-4 4h-3l-4 3v-3H8a4 4 0 01-4-4z"/></SvgIcon>;
const SparklesIcon = () => <SvgIcon><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5zM6 16l.8 2.2L9 19l-2.2.8L6 22l-.8-2.2L3 19l2.2-.8z"/></SvgIcon>;
const HeartIcon = () => <SvgIcon><path d="M12 21s-8-7-8-13a5 5 0 019-3 5 5 0 019 3c0 6-8 13-8 13z"/></SvgIcon>;
const FallbackIcon = () => <SvgIcon><path d="M4 6h16v12H4zM8 10h8M8 14h5"/></SvgIcon>;

function iconForType(type) {
  const k = slug(type);
  if (k === "leaders") return <TrophyIcon />;
  if (k === "actual") return <BoltIcon />;
  if (k === "comments") return <CommentIcon />;
  if (k === "new") return <SparklesIcon />;
  if (k === "for-you" || k === "foryou") return <HeartIcon />;
  return <FallbackIcon />;
}

function iconFromSpec(spec) {
  if (!spec) return null;
  if (typeof spec === "string" && spec.startsWith("emoji:")) {
    const ch = spec.slice("emoji:".length);
    return <span aria-hidden="true" class="inline-block leading-none">{ch}</span>;
  }
  return null;
}

export default function TabsBar() {
  const app = useApp();
  const { t, domainAssetsConfig, setLastTabRoute } = app;
  const { lang } = useI18n();
  const { route } = useHashRouter();

  const tabsPath = createMemo(() => domainAssetsConfig?.()?.modules?.tabs || "modules/tabs.yaml");

  const [tabsRaw] = createResource(
    () => tabsPath(),
    async (relPath) => {
      if (!relPath) return [];
      const data = (await loadAssetResource(app, relPath, { type: "yaml" })) || {};
      const list = Array.isArray(data) ? data : Array.isArray(data.tabs) ? data.tabs : [];
      return list.map((x, i) => ({
        id: x?.id ?? x?.type ?? `tab_${i}`,
        type: x?.type ?? x?.id ?? `tab_${i}`,
        _raw: x,
      }));
    }
  );

  const [selectedId, setSelectedId] = createSignal("");

  const items = createMemo(() =>
    (tabsRaw() || []).map((tab) => {
      const label = t(`tabs.title.${slug(tab.type)}`) || t("main.tabs.untitled");
      const explicit = iconFromSpec(tab._raw.icon);
      const auto = iconForType(tab.type);
      return { id: tab.id, label, icon: explicit || auto, type: tab.type };
    })
  );

  createEffect(() => {
    const list = tabsRaw();
    if (!list || list.length === 0) return setSelectedId("");

    const key = firstSeg(route());
    const match = list.find(t => slug(t.id) === key || slug(t.type) === key);

    if (match) {
      if (selectedId() !== match.id) {
        setSelectedId(match.id);
        setLastTabRoute(route());
      }
    } else {
      const r = route();
      const isPageRoute = r.startsWith("/post/") || r.startsWith("/settings") || r.startsWith("/docs");
      
      if (isPageRoute) {
        setSelectedId("");
      } else {
        const first = list[0];
        const defaultPath = pathFor(first.type || first.id);
        batch(() => {
          setSelectedId(first.id);
          navigate(defaultPath, { replace: true });
          setLastTabRoute(defaultPath);
        });
      }
    }
  });

  function handleTabChange(nextId) {
    const entry = (tabsRaw() || []).find((t) => t.id === nextId);
    if (!entry) return;
    const newPath = pathFor(entry.type || entry.id);
    if (route() !== newPath) {
      navigate(newPath);
    }
  }
  
  return (
    <section class="w-full">
      <div class="sv-container sv-container--no-gutter">
        <Show when={!tabsRaw.loading} fallback={<div class="p-4 text-sm text-center">{t("main.tabs.loading")}</div>}>
          <Tabs items={items()} value={selectedId()} onChange={handleTabChange} compactWidth={768} />
        </Show>

        <div class="tabs_panel">
          {/* --- FIX: Render all tabs and use `display` to show the active one --- */}
          <For each={tabsRaw()}>
            {(tab) => {
              const Comp = getTabComponent(tab.type);
              const title = t(`tabs.title.${slug(tab.type)}`) || t("main.tabs.untitled");
              const rightPanelConfig = tab._raw?.right_panel;
              const isRailVisible = rightPanelConfig?.available;

              return (
                <div style={{ display: tab.id === selectedId() ? 'block' : 'none' }}>
                  <RightRailLayout rightPanelConfig={rightPanelConfig}>
                    <Show when={Comp} fallback={<TabPanelScaffold title={title} />}>
                      <Comp title={title} tab={tab} isRailVisible={isRailVisible} />
                    </Show>
                  </RightRailLayout>
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </section>
  );
}