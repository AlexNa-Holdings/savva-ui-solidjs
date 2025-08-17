/* src/components/main/TabsBar.jsx */
import { createResource, For, Show, createMemo, createSignal, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext";
import { useI18n } from "../../i18n/useI18n";
import { loadAssetResource } from "../../utils/assetLoader";
import Tabs from "../ui/Tabs.jsx";

/* small, consistent SVG wrapper */
function SvgIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      class={props.class || "w-4 h-4"}
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}

/* default icons by tab type */
function TrophyIcon() {
  return (
    <SvgIcon>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10" />
      <path d="M7 8a5 5 0 0010 0" />
      <path d="M7 4a4 4 0 01-4 4" />
      <path d="M17 4a4 4 0 004 4" />
    </SvgIcon>
  );
}
function BoltIcon() {
  return (
    <SvgIcon>
      <path d="M13 2L3 14h6l-2 8 10-12h-6l2-8z" />
    </SvgIcon>
  );
}
function CommentIcon() {
  return (
    <SvgIcon>
      <path d="M4 6h16v8a4 4 0 01-4 4h-3l-4 3v-3H8a4 4 0 01-4-4z" />
    </SvgIcon>
  );
}
function SparklesIcon() {
  return (
    <SvgIcon>
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
      <path d="M6 16l.8 2.2L9 19l-2.2.8L6 22l-.8-2.2L3 19l2.2-.8z" />
    </SvgIcon>
  );
}
function HeartIcon() {
  return (
    <SvgIcon>
      <path d="M12 21s-8-7-8-13a5 5 0 019-3 5 5 0 019 3c0 6-8 13-8 13z" />
    </SvgIcon>
  );
}
function FallbackIcon() {
  return (
    <SvgIcon>
      <path d="M4 6h16v12H4z" />
      <path d="M8 10h8M8 14h5" />
    </SvgIcon>
  );
}

/* map the known types to icons */
function iconForType(type) {
  const k = String(type || "").toLowerCase();
  if (k === "leaders") return <TrophyIcon />;
  if (k === "actual") return <BoltIcon />;
  if (k === "comments") return <CommentIcon />;
  if (k === "new") return <SparklesIcon />;
  if (k === "for-you" || k === "foryou") return <HeartIcon />;
  return <FallbackIcon />;
}

/* allow YAML to override icons later, e.g., icon: "emoji:🔥" */
function iconFromSpec(spec) {
  if (!spec) return null;
  if (typeof spec === "string" && spec.startsWith("emoji:")) {
    const ch = spec.slice("emoji:".length);
    return <span aria-hidden="true" class="inline-block leading-none">{ch}</span>;
  }
  // otherwise ignore untrusted/unknown formats
  return null;
}

export default function TabsBar() {
  const app = useApp();
  const { t, domainAssetsConfig, selectedDomain } = app;
  const { lang } = useI18n();

  const domainName = createMemo(() => {
    const d = selectedDomain?.();
    return !d ? "" : typeof d === "string" ? d : d.name || "";
  });

  const tabsPath = createMemo(() => {
    const cfg = domainAssetsConfig?.();
    return cfg?.modules?.tabs || "modules/tabs.yaml";
  });

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

  function pickByLocale(obj, langCode) {
    if (!obj || typeof obj !== "object") return undefined;
    const lc = (langCode || "en").toString();
    if (obj[lc] !== undefined) return obj[lc];
    const base = lc.toLowerCase().split(/[-_]/)[0];
    if (obj[base] !== undefined) return obj[base];
    return obj["*"];
  }

  function resolveTitle(title, langCode, domain) {
    if (!title) return "";
    if (typeof title === "string") return title;
    const byLocale = pickByLocale(title, langCode);
    if (byLocale) {
      if (typeof byLocale === "string") return byLocale;
      if (typeof byLocale === "object") {
        const byDomain = byLocale[domain] ?? byLocale["*"];
        if (typeof byDomain === "string") return byDomain;
        const anyStr = Object.values(byLocale).find((v) => typeof v === "string");
        if (anyStr) return anyStr;
      }
    }
    const topStr = Object.values(title).find((v) => typeof v === "string");
    if (topStr) return topStr;
    for (const v of Object.values(title)) {
      if (v && typeof v === "object") {
        const byDomain = v[domain] ?? v["*"];
        if (typeof byDomain === "string") return byDomain;
        const anyStr = Object.values(v).find((x) => typeof x === "string");
        if (anyStr) return anyStr;
      }
    }
    return "";
  }

  const [selectedId, setSelectedId] = createSignal("");

  createEffect(() => {
    const list = tabsRaw() || [];
    if (!list.length) return setSelectedId("");
    if (!list.some((t) => t.id === selectedId())) setSelectedId(list[0].id);
  });

  const langCode = () => (typeof lang === "function" ? lang() : lang) || "en";

  const items = createMemo(() =>
    (tabsRaw() || []).map((tab) => {
      const label = resolveTitle(tab.title, langCode(), domainName()) || t("main.tabs.untitled");
      const explicit = iconFromSpec(tab.icon);
      const auto = iconForType(tab.type || tab.id);
      return {
        id: tab.id,
        label,
        icon: explicit || auto,
      };
    })
  );

  const labelById = createMemo(() => {
    const map = new Map();
    (items() || []).forEach((it) => map.set(it.id, it.label));
    return map;
  });

  return (
    <section class="w-full">
      <div class="max-w-6xl mx-auto px-0">
        <Show
          when={!tabsRaw.loading}
          fallback={<span class="text-sm text-neutral-500 dark:text-neutral-400">{t("main.tabs.loading")}</span>}
        >
          <Tabs items={items()} value={selectedId()} onChange={setSelectedId} />
        </Show>

        <div class="mt-2 rotabs__panel">
          <For each={tabsRaw() || []}>
            {(tab) => (
              <Show when={selectedId() === tab.id}>
                <section id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`}>
                  <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    {labelById().get(tab.id) || t("main.tabs.untitled")}
                  </h3>
                  <p class="text-sm text-neutral-600 dark:text-neutral-400">
                    {t("main.tabs.empty")}
                  </p>
                </section>
              </Show>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}
