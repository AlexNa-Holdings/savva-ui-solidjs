// src/components/tabs/NewTab.jsx
import { createMemo, createResource, createSignal, Show, For, createEffect } from "solid-js";
import ContentFeed from "../feed/ContentFeed.jsx";
import { useApp } from "../../context/AppContext.jsx";
import { loadAssetResource } from "../../utils/assetLoader";
import ViewModeToggle from "../ui/ViewModeToggle.jsx";

/** Load categories from modules/categories.yaml with i18n fallback; refetch on lang change */
function useDomainCategories(app) {
  const cfg = () => app.domainAssetsConfig?.();
  const relPath = createMemo(() => cfg()?.modules?.categories || null);
  const lang = () => (app.lang?.() || "en").toLowerCase();

  // Refetch whenever either the relPath OR current lang changes
  const params = createMemo(() => ({ rel: relPath(), lang: lang() }));

  const [cats] = createResource(params, async ({ rel, lang }) => {
    if (!rel) return [];
    const data = await loadAssetResource(app, rel, { type: "yaml" });
    const listByLang = data?.locales?.[lang] || data?.locales?.en || [];
    return (Array.isArray(listByLang) ? listByLang : []).map(String);
  });

  return cats;
}

export default function NewTab() {
  const app = useApp();

  // View mode (no persistence)
  const [mode, setMode] = createSignal("list");

  // Category (no persistence) — string "ALL" or localized category label
  const [category, setCategory] = createSignal("ALL");

  const categoriesRes = useDomainCategories(app);
  const categoriesWithAll = createMemo(() => ["ALL", ...(categoriesRes() || [])]);

  // Reset selection to "ALL" whenever the UI language changes
  createEffect(() => {
    void app.lang?.(); // track lang
    setCategory("ALL");
  });

  // Backend sugar
  const domainName = () => {
    const d = app.selectedDomain?.();
    return typeof d === "string" ? d : d?.name || "";
  };
  const contentList = app.wsMethod ? app.wsMethod("content-list") : null;

  async function fetchPage(page, pageSize) {
    const limit = pageSize;
    const offset = (page - 1) * pageSize;
    try {
      if (!contentList) return [];
      const params = { domain: domainName(), limit, offset };
      const cat = category();
      if (cat && cat !== "ALL") params.category = cat; // safe if backend ignores
      const res = await contentList(params);

      const arr =
        Array.isArray(res) ? res :
        Array.isArray(res?.list) ? res.list :
        Array.isArray(res?.items) ? res.items :
        Array.isArray(res?.data) ? res.data : [];

      return arr.map((it, i) => ({
        id: it?.savva_cid || it?.savvaCID || it?.id || `content_${page}_${i}`,
        text: it?.text_preview || it?.textPreview || it?.title || it?.description || it?.summary || "",
        _raw: it,
      }));
    } catch {
      return [];
    }
  }

  return (
    <section class="w-full">
      {/* Compact top controls */}
      <div class="mb-3 flex items-center gap-3">
        <ViewModeToggle value={mode()} onChange={setMode} size="md" />
        <div class="ml-auto flex items-center gap-2 min-w-[220px]">
          <span class="text-xs opacity-70">{app.t("newTab.category")}</span>
          <select
            class="flex-1 px-3 h-9 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]"
            value={category()}
            onInput={(e) => setCategory(e.currentTarget.value)}
            aria-label={app.t("newTab.category")}
          >
            <For each={categoriesWithAll()}>
              {(c) => <option value={c}>{c === "ALL" ? app.t("categories.all") : c}</option>}
            </For>
          </select>
          <Show when={categoriesRes.loading}>
            <div class="text-xs opacity-70">{app.t("common.loading")}</div>
          </Show>
        </div>
      </div>

      <ContentFeed mode={mode()} fetchPage={fetchPage} pageSize={12} />
    </section>
  );
}
