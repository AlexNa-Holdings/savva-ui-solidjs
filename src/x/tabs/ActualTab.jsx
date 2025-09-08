// src/x/tabs/ActualTab.jsx
import { createMemo, createSignal, createEffect } from "solid-js";
import ContentFeed from "../feed/ContentFeed.jsx";
import { useApp } from "../../context/AppContext.jsx";
import ViewModeToggle, { viewMode } from "../ui/ViewModeToggle.jsx";
import { toChecksumAddress } from "../../blockchain/utils.js";
import { useHashRouter } from "../../routing/hashRouter.js";

export default function ActualTab(props) {
  const app = useApp();
  const { route } = useHashRouter();
  const lang = createMemo(() => (app.lang?.() || "en").toLowerCase());
  const [category, setCategory] = createSignal("ALL");

  createEffect(() => {
    if (!props.isActivated) return;
    const path = route() || "";
    const params = new URLSearchParams(path.split("?")[1] || "");
    const catFromUrl = params.get("category");
    const categoryName = catFromUrl ? (catFromUrl.includes(":") ? catFromUrl.split(":")[1] : catFromUrl) : "ALL";
    if (category() !== categoryName) {
      setCategory(categoryName);
    }
  });

  const domainName = () => {
    const d = app.selectedDomain?.();
    return typeof d === "string" ? d : d?.name || "";
  };
  const contentList = app.wsMethod ? app.wsMethod("content-list") : null;

  const feedResetKey = createMemo(() => `${domainName()}|${category()}`);

  const title = createMemo(() => {
    const cat = category();
    const baseTitle = props.title;
    if (cat && cat !== "ALL") {
      const leafName = cat.split('/').pop();
      return `${baseTitle}: ${leafName}`;
    }
    return baseTitle;
  });

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
      <div class="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-2 tab-header-icon">
          <span class="text-[hsl(var(--muted-foreground))]">{props.icon}</span>
          <h2 class="text-xl font-semibold">{title()}</h2>
        </div>
        <div class="flex items-center gap-3">
          <ViewModeToggle size="md" />
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