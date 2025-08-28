// src/components/tabs/ActualTab.jsx
import { createMemo, createResource, createSignal, Show, For, createEffect } from "solid-js";
import ContentFeed from "../feed/ContentFeed.jsx";
import { useApp } from "../../context/AppContext.jsx";
import { loadAssetResource } from "../../utils/assetLoader";
import ViewModeToggle, { viewMode } from "../ui/ViewModeToggle.jsx";
import { toChecksumAddress } from "../../blockchain/utils.js";

function useDomainCategories(app) {
  const cfg = () => app.domainAssetsConfig?.();
  const relPath = createMemo(() => cfg()?.modules?.categories || null);
  const lang = () => (app.lang?.() || "en").toLowerCase();
  const params = createMemo(() => ({ rel: relPath(), lang: lang() }));
  const [cats] = createResource(params, async ({ rel, lang }) => {
    if (!rel) return [];
    try {
      const data = await loadAssetResource(app, rel, { type: "yaml" });
      const listByLang = data?.locales?.[lang] || data?.locales?.en || [];
      return (Array.isArray(listByLang) ? listByLang : []).map(String);
    } catch (err) {
      console.error(`Failed to load categories from ${rel}:`, err);
      return [];
    }
  });
  return cats;
}

export default function ActualTab(props) {
  const app = useApp();
  const lang = createMemo(() => (app.lang?.() || "en").toLowerCase());
  const [category, setCategory] = createSignal("ALL");
  const categoriesRes = useDomainCategories(app);
  const categoriesWithAll = createMemo(() => ["ALL", ...(categoriesRes() || [])]);

  createEffect(() => {
    const newList = categoriesRes();
    const currentSelection = category();
    if (newList && currentSelection !== "ALL" && !newList.includes(currentSelection)) {
      setCategory("ALL");
    }
  });

  const domainName = () => {
    const d = app.selectedDomain?.();
    return typeof d === "string" ? d : d?.name || "";
  };
  const contentList = app.wsMethod ? app.wsMethod("content-list") : null;

  const feedResetKey = createMemo(() => `${domainName()}|${category()}`);

  async function fetchPage(page, pageSize) {
    const limit = pageSize;
    const offset = (page - 1) * pageSize;
    try {
      if (!contentList) return [];
      const params = {
        domain: domainName(),
        content_type: "post",
        limit,
        offset,
        lang: lang(),
        // MODIFICATION: Added new sort order for this tab.
        order_by: 'fund_amount'
      };
      
      const cat = category();
      if (cat && cat !== "ALL") {
        params.category = `${lang()}:${cat}`;
      }
      
      const user = app.authorizedUser();
      if (user?.address) {
        params.my_addr = toChecksumAddress(user.address);
      }

      const res = await contentList(params);
      const arr = Array.isArray(res) ? res : Array.isArray(res?.list) ? res.list : [];
      return arr.map((it) => ({
        id: it?.savva_cid || it?.savvaCID || it?.id,
        _raw: it,
      }));
    } catch (err) {
      console.error("fetchPage error:", err);
      return [];
    }
  }

  return (
    <section class="w-full">
      <div class="mb-3 flex items-center gap-3">
        <ViewModeToggle size="md" />
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
      <ContentFeed
        mode={viewMode()}
        fetchPage={fetchPage}
        pageSize={12}
        resetOn={feedResetKey()}
        isRailVisible={props.isRailVisible}
        isActivated={props.isActivated}
      />
    </section>
  );
}