// src/x/tabs/NewTab.jsx
import { createMemo, createResource, createSignal, Show, For, createEffect } from "solid-js";
import ContentFeed from "../feed/ContentFeed.jsx";
import { useApp } from "../../context/AppContext.jsx";
import ViewModeToggle, { viewMode } from "../ui/ViewModeToggle.jsx";
import { toChecksumAddress } from "../../blockchain/utils.js";
import { dbg } from "../../utils/debug.js";
import { whenWsOpen } from "../../net/wsRuntime.js";
import { getDraftParams, clearDraft, DRAFT_DIRS } from "../../editor/storage.js";
import { pushToast } from "../../ui/toast.js";
import { useHashRouter } from "../../routing/smartRouter.js";
import useUserProfile, { selectField } from "../profile/userProfileStore";
import { loadNsfwPreference } from "../preferences/storage.js";

export default function NewTab(props) {
  const app = useApp();
  const { route } = useHashRouter();
  const lang = createMemo(() => (app.lang?.() || "en").toLowerCase());
  const [category, setCategory] = createSignal("ALL");

  const showNsfw = () => {
    const pref = loadNsfwPreference();
    return pref === "s" || pref === "w";
  };

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

  const feedResetKey = createMemo(() => `${domainName()}|${category()}|${app.newTabRefreshKey()}`);

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
      dbg.log('NewTab', `fetchPage called for page ${page}. WS Status: ${app.wsStatus()}`);
      await whenWsOpen();
      dbg.log("NewTab", "after whenWsOpen");

      if (!contentList) {
        dbg.warn('NewTab', 'wsMethod("content-list") is not available at fetch time.');
        return [];
      }
      const params = { domain: domainName(), content_type: "post", limit, offset, lang: lang(), show_nsfw: showNsfw() };
      const cat = category();
      if (cat && cat !== "ALL") {
        params.category = `${lang()}:${cat}`;
      }

      const user = app.authorizedUser();
      if (user?.address) {
        params.my_addr = toChecksumAddress(user.address);
      }

      dbg.log('NewTab', 'Fetching with params:', params);
      const res = await contentList(params);
      const arr = Array.isArray(res) ? res : Array.isArray(res?.list) ? res.list : [];

      const draftParams = await getDraftParams(DRAFT_DIRS.NEW_POST);
      if (draftParams?.guid) {
        const newPostsHaveDraftGuid = arr.some(post => post.guid === draftParams.guid);
        if (newPostsHaveDraftGuid) {
          await clearDraft(DRAFT_DIRS.NEW_POST);
          pushToast({ type: "success", message: app.t("editor.publish.draftCleared") });
        }
      }

      return arr.map((it) => ({
        id: it?.savva_cid || it?.savvaCID || it?.id,
        _raw: it,
      }));
    } catch (err) {
      dbg.error('NewTab', "fetchPage error:", err);
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
        onItemsChange={app.setNewFeedItems}
        isActivated={props.isActivated}
      />
    </section>
  );
}