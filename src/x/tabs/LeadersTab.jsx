// src/x/tabs/LeadersTab.jsx
import { createMemo, createSignal, For, createEffect } from "solid-js";
import ContentFeed from "../feed/ContentFeed.jsx";
import { useApp } from "../../context/AppContext.jsx";
import ViewModeToggle, { viewMode } from "../ui/ViewModeToggle.jsx";
import { toChecksumAddress } from "../../blockchain/utils.js";
import { whenWsOpen } from "../../net/wsRuntime.js";
import { useHashRouter } from "../../routing/hashRouter.js";

const TIME_FRAMES = ["month", "week", "year", "all"];

export default function LeadersTab(props) {
  const app = useApp();
  const { route } = useHashRouter();
  const lang = createMemo(() => (app.lang?.() || "en").toLowerCase());
  const [category, setCategory] = createSignal("ALL");
  const [timeFrame, setTimeFrame] = createSignal("month");

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

  const feedResetKey = createMemo(() => `${domainName()}|${category()}|${timeFrame()}`);

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
      await whenWsOpen();
      if (!contentList) return [];
      const params = {
        domain: domainName(),
        content_type: "post",
        limit,
        offset,
        lang: lang(),
        order_by: 'total_author_share'
      };
      
      const cat = category();
      if (cat && cat !== "ALL") {
        params.category = `${lang()}:${cat}`;
      }

      const user = app.authorizedUser();
      if (user?.address) {
        params.my_addr = toChecksumAddress(user.address);
      }

      const selectedTime = timeFrame();
      if (selectedTime !== "all") {
        const now = new Date();
        let pastDate = new Date();
        if (selectedTime === 'week') pastDate.setDate(now.getDate() - 7);
        if (selectedTime === 'month') pastDate.setMonth(now.getMonth() - 1);
        if (selectedTime === 'year') pastDate.setFullYear(now.getFullYear() - 1);
        params.min_time = pastDate.toISOString();
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
          <div class="flex items-center gap-2">
            <select
              class="flex-1 px-3 h-9 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]"
              value={timeFrame()}
              onInput={(e) => setTimeFrame(e.currentTarget.value)}
              aria-label="Time frame"
            >
              <For each={TIME_FRAMES}>
                {(frame) => <option value={frame}>{app.t(`timeFrame.${frame}`)}</option>}
              </For>
            </select>
          </div>
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