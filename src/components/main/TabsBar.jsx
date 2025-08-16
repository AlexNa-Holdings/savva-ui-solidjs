// src/components/main/TabsBar.jsx
import { createResource, For, Show, createMemo, createSignal, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext";
import { useI18n } from "../../i18n/useI18n";
import { loadAssetResource } from "../../utils/assetLoader";

export default function TabsBar() {
  const app = useApp();
  const { t, domainAssetsConfig, selectedDomain } = app;
  const { lang } = useI18n();

  // Current domain name (for per-domain titles in tabs.yaml)
  const domainName = createMemo(() => {
    const d = selectedDomain?.();
    return !d ? "" : typeof d === "string" ? d : d.name || "";
  });

  // Locate the tabs manifest relative path:
  // - Prefer domain config: config.modules.tabs
  // - Fallback to the default pack's conventional path: "modules/tabs.yaml"
  const tabsPath = createMemo(() => {
    const cfg = domainAssetsConfig?.();
    return cfg?.modules?.tabs || "modules/tabs.yaml";
  });

  // Fetch & parse using the new asset loader (auto domain/default prefix)
  const [tabsRaw] = createResource(
    () => tabsPath(),
    async (relPath) => {
      if (!relPath) return [];
      const data = (await loadAssetResource(app, relPath, { type: "yaml" })) || {};
      const list = Array.isArray(data) ? data : Array.isArray(data.tabs) ? data.tabs : [];
      return list.map((x, i) => ({
        id: x?.id ?? `tab_${i}`,
        title: x?.title, // string | { locale -> string|{domain->string} }
        _raw: x,
      }));
    }
  );

  // ── locale normalization ─────────────────────────────────────────────────────
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

  // ── selection state ──────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = createSignal("");

  // When tabs load or change (domain/pack switch), auto-select the first one
  createEffect(() => {
    const list = tabsRaw() || [];
    if (!list.length) {
      setSelectedId("");
      return;
    }
    // if current selectedId is not present in new list, pick the first
    if (!list.some((t) => t.id === selectedId())) {
      setSelectedId(list[0].id);
    }
  });

  // ── render ───────────────────────────────────────────────────────────────────
  const langCode = () => (typeof lang === "function" ? lang() : lang) || "en";

  return (
    <nav class="w-full overflow-x-auto border-b border-neutral-200/60 dark:border-neutral-800/60">
      <div class="max-w-6xl mx-auto px-4">
        <div class="flex gap-3 sm:gap-4 py-2">
          <Show
            when={!tabsRaw.loading}
            fallback={
              <span class="text-sm text-neutral-500 dark:text-neutral-400">
                {t("main.tabs.loading")}
              </span>
            }
          >
            <For each={tabsRaw() || []}>
              {(tab) => {
                const active = () => tab.id === selectedId();
                const label =
                  resolveTitle(tab.title, langCode(), domainName()) ||
                  t("main.tabs.untitled");

                return (
                  <button
                    type="button"
                    onClick={() => setSelectedId(tab.id)}
                    aria-selected={active()}
                    class={`px-3 py-1.5 text-sm transition ${
                      active()
                        ? "bg-neutral-200 dark:bg-neutral-700 font-medium"
                        : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    }`}
                  >
                    {label}
                  </button>
                );
              }}
            </For>
          </Show>
        </div>
      </div>
    </nav>
  );
}
