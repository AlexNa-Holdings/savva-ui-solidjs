// src/components/main/TabsBar.jsx
/* src/components/main/TabsBar.jsx */
import { createResource, For, Show, createMemo, createSignal, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext";
import { useI18n } from "../../i18n/useI18n";
import { loadAssetResource } from "../../utils/assetLoader";
import Tabs from "../ui/Tabs.jsx";

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
        id: x?.id ?? `tab_${i}`,
        title: x?.title,
        icon: x?.icon, // optional
        _raw: x,
      }));
    }
  );

  // locale helpers
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

  // selection
  const [selectedId, setSelectedId] = createSignal("");

  createEffect(() => {
    const list = tabsRaw() || [];
    if (!list.length) return setSelectedId("");
    if (!list.some((t) => t.id === selectedId())) setSelectedId(list[0].id);
  });

  const langCode = () => (typeof lang === "function" ? lang() : lang) || "en";

  const items = createMemo(() =>
    (tabsRaw() || []).map((tab) => ({
      id: tab.id,
      label: resolveTitle(tab.title, langCode(), domainName()) || t("main.tabs.untitled"),
      icon: tab.icon ? <span>{tab.icon}</span> : null,
    }))
  );

  const labelById = createMemo(() => {
    const map = new Map();
    (items() || []).forEach((it) => map.set(it.id, it.label));
    return map;
  });

  return (
    <section class="w-full">
      <div class="max-w-6xl mx-auto px-4">
        {/* Round‑out tabs bar */}
        <Show
          when={!tabsRaw.loading}
          fallback={<span class="text-sm text-neutral-500 dark:text-neutral-400">{t("main.tabs.loading")}</span>}
        >
          {/* You can override the rail color per place if needed:
              <Tabs class="!my-0" /> and set it via inline style: style={{ "--rt-rail": "#1f2937" }} */}
          <Tabs items={items()} value={selectedId()} onChange={setSelectedId} />
        </Show>

        {/* Content panel (empty for now) */}
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
                  {/* TODO: replace with real tab content */}
                </section>
              </Show>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}
