// src/components/main/TabsBar.jsx
import { createResource, For, Show, createMemo, createSignal, createEffect, batch } from "solid-js";
import { useApp } from "../../context/AppContext";
import { useI18n } from "../../i18n/useI18n";
import { loadAssetResource } from "../../utils/assetLoader";
import { useHashRouter, navigate } from "../../routing/hashRouter";
import Tabs from "../ui/Tabs.jsx";
import { getTabComponent } from "../tabs";
import RightRailLayout from "../tabs/RightRailLayout.jsx";

// route helpers (no /t prefix; use "/actual", "/leaders", etc.)
const slug = (s) => String(s || "").trim().toLowerCase();
const firstSeg = (path) => {
  const p = String(path || "/");
  const s = p.startsWith("/") ? p.slice(1) : p;
  const seg = s.split(/[?#/]/, 1)[0];
  return slug(seg);
};
const pathFor = (idOrType) => `/${encodeURIComponent(slug(idOrType)) || ""}`;

// icons
function SvgIcon(props) {
  return (
    <svg viewBox="0 0 24 24" class={props.class || "w-4 h-4"} fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {props.children}
    </svg>
  );
}
const TrophyIcon  = () => (<SvgIcon><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10"/><path d="M7 8a5 5 0 0010 0"/><path d="M7 4a4 4 0 01-4 4"/><path d="M17 4a4 4 0 004 4"/></SvgIcon>);
const BoltIcon    = () => (<SvgIcon><path d="M13 2L3 14h6l-2 8 10-12h-6l2-8z"/></SvgIcon>);
const CommentIcon = () => (<SvgIcon><path d="M4 6h16v8a4 4 0 01-4 4h-3l-4 3v-3H8a4 4 0 01-4-4z"/></SvgIcon>);
const SparklesIcon= () => (<SvgIcon><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M6 16l.8 2.2L9 19l-2.2.8L6 22l-.8-2.2L3 19l2.2-.8z"/></SvgIcon>);
const HeartIcon   = () => (<SvgIcon><path d="M12 21s-8-7-8-13a5 5 0 019-3 5 5 0 019 3c0 6-8 13-8 13z"/></SvgIcon>);
const FallbackIcon= () => (<SvgIcon><path d="M4 6h16v12H4z"/><path d="M8 10h8M8 14h5"/></SvgIcon>);

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
  const { t, domainAssetsConfig, selectedDomain } = app;
  const { lang } = useI18n();
  const { route } = useHashRouter();

  const domainName = createMemo(() => {
    const d = selectedDomain?.();
    return !d ? "" : typeof d === "string" ? d : d.name || "";
  });

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
        title: x?.title,
        icon: x?.icon || null,
        _raw: x,
      }));
    }
  );

  // i18n helpers
  function pickByLocale(obj, langCode) {
    if (!obj || typeof obj !== "object") return undefined;
    const lc = (langCode || "en").toString();
    if (obj[lc] !== undefined) return obj[lc];
    const base = lc.toLowerCase().split(/[-_]/)[0];
    if (obj[base] !== undefined) return obj[base];
    return obj["*"];
  }


  // selection + URL sync
  const [selectedId, setSelectedId] = createSignal("");
  const langCode = () => (typeof lang === "function" ? lang() : lang) || "en";

  const items = createMemo(() =>
    (tabsRaw() || []).map((tab) => {
      // Following comments are used by the auto translator. Do not remove these comments
      // t("tabs.title.leaders")
      // t("tabs.title.actual")
      // t("tabs.title.comments")
      // t("tabs.title.new")
      // t("tabs.title.for-you")
      const label = t("tabs.title." + tab.type) || t("main.tabs.untitled");
      const explicit = iconFromSpec(tab.icon);
      const auto = iconForType(tab.type || tab.id);
      return { id: tab.id, label, icon: explicit || auto, type: tab.type };
    })
  );

  const labelById = createMemo(() => {
    const map = new Map();
    (items() || []).forEach((it) => map.set(it.id, it.label));
    return map;
  });

  // init/fix selection vs URL
  createEffect(() => {
    const list = tabsRaw() || [];
    if (!list.length) return setSelectedId("");

    const key = firstSeg(route());
    const hasKey = (k) => list.some((t) => slug(t.id) === k || slug(t.type) === k);

    if (key && hasKey(key)) {
      const match = list.find((t) => slug(t.id) === key) || list.find((t) => slug(t.type) === key);
      if (match && selectedId() !== match.id) setSelectedId(match.id);
    } else if (!selectedId() || !list.some((t) => t.id === selectedId())) {
      const first = list[0];
      batch(() => {
        setSelectedId(first.id);
        navigate(pathFor(first.type || first.id), { replace: true });
      });
    }
  });

  function handleTabChange(nextId) {
    const list = tabsRaw() || [];
    const entry = list.find((t) => t.id === nextId);
    if (!entry) return;
    batch(() => {
      setSelectedId(nextId);
      const want = pathFor(entry.type || entry.id);
      if (route() !== want) navigate(want);
    });
  }

  return (
    <section class="w-full" >
      {/* changed: let outer Container control width; keep full width here */}
      <div class="sv-container sv-container--no-gutter">
        <Show
          when={!tabsRaw.loading}
          fallback={<span class="text-sm text-[hsl(var(--muted-foreground))]">{t("main.tabs.loading")}</span>}
        >
          <Tabs
            items={(items() || []).map(({ id, label, icon }) => ({ id, label, icon }))}
            value={selectedId()}
            onChange={handleTabChange}
            compactWidth={768} 
          />
        </Show>

        <div class="tabs_panel">
          <For each={tabsRaw() || []}>
            {(tab) => {
              const active = () => selectedId() === tab.id;
              const Comp = getTabComponent(tab.type);
              const title = labelById().get(tab.id) || t("main.tabs.untitled");
              const rightCfg = tab?._raw?.right_panel || { available: false };

              return (
                <Show when={active()}>
                  {Comp ? (
                    rightCfg?.available  ? (
                      <RightRailLayout>
                        <Comp title={title} tab={tab} />
                      </RightRailLayout>
                    ) : (
                      <Comp title={title} tab={tab} />
                    )
                  ) : rightCfg?.available ? (
                    <RightRailLayout>
                      <>
                        <h3 class="text-base font-semibold text-[hsl(var(--foreground))] mb-2">{title}</h3>
                        <p class="text-sm text-[hsl(var(--muted-foreground))]">{t("main.tabs.empty")}</p>
                      </>
                    </RightRailLayout>
                  ) : (
                    <>
                      <h3 class="text-base font-semibold text-[hsl(var(--foreground))]">{title}</h3>
                      <p class="text-sm text-[hsl(var(--muted-foreground))]">{t("main.tabs.empty")}</p>
                    </>
                  )}
                </Show>
              );
            }}
          </For>
        </div>
      </div>
    </section>
  );
}
