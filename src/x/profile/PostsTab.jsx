// src/x/profile/PostsTab.jsx
import { createSignal, createResource, createMemo, For, Show, Switch, Match } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import ContentFeed from "../feed/ContentFeed.jsx";
import ViewModeToggle, { viewMode } from "../ui/ViewModeToggle.jsx";
import { toChecksumAddress } from "../../blockchain/utils.js";
import TagList from "./TagList.jsx";
import { useDomainCategories } from "../../hooks/useDomainCategories.js";
import useUserProfile, { selectField } from "../profile/userProfileStore";
import { loadNsfwPreference } from "../preferences/storage.js";

async function fetchUserTags(params) {
  const { app, user_addr, lang } = params;
  if (!app.wsMethod || !user_addr || !lang) return [];
  try {
    const getTags = app.wsMethod("get-user-tags");
    const res = await getTags({
      domain: app.selectedDomainName(),
      user_addr: user_addr,
      locale: lang,
    });
    return Array.isArray(res) ? res.sort() : [];
  } catch (e) {
    console.error("Failed to fetch user tags:", e);
    return [];
  }
}

export default function PostsTab(props) {
  const app = useApp();
  const { t } = app;
  const lang = () => app.lang();
  const user = () => props.user;

  const [selectedTags, setSelectedTags] = createSignal([]);
  const [selectedCategory, setSelectedCategory] = createSignal("ALL");

  const { dataStable: profile } = useUserProfile();

  const isViewingSelf = createMemo(() => {
    const actor = (app.actorAddress?.() || app.authorizedUser?.()?.address || "").toLowerCase();
    const viewed = (user()?.address || "").toLowerCase();
    return !!actor && !!viewed && actor === viewed;
  });

  const showNsfw = () => {
    if (isViewingSelf()) return true; // actor viewing their own profile → always show
    const pref = loadNsfwPreference();
    return pref === "s" || pref === "w";
  };

  const [tagsResource] = createResource(() => ({
    app,
    user_addr: user()?.address,
    lang: lang()
  }), fetchUserTags);

  const categoriesResource = useDomainCategories(app);
  const categoriesWithAll = createMemo(() => ["ALL", ...(categoriesResource() || [])]);

  const contentList = app.wsMethod ? app.wsMethod("content-list") : null;
  const feedResetKey = createMemo(() => `${selectedCategory()}|${selectedTags().join(',')}`);

  async function fetchPage(page, pageSize) {
    if (!contentList || !user()?.address) return [];

    const params = {
      domain: app.selectedDomainName(),
      author_addr: toChecksumAddress(user().address),
      my_addr: app.authorizedUser()?.address ? toChecksumAddress(app.authorizedUser().address) : undefined,
      content_type: "post",
      limit: pageSize,
      offset: (page - 1) * pageSize,
      lang: lang(),
      show_nsfw: showNsfw()
    };

    const cat = selectedCategory();
    if (cat && cat !== "ALL") params.category = `${lang()}:${cat}`;

    const tags = selectedTags();
    if (tags.length > 0) params.tags = tags.map(tag => `${lang()}:${tag}`);

    try {
      const res = await contentList(params);
      const arr = Array.isArray(res) ? res : Array.isArray(res?.list) ? res.list : [];
      return arr.map((it) => ({ id: it.savva_cid, _raw: it }));
    } catch (err) {
      console.error("PostsTab fetchPage error:", err);
      return [];
    }
  }

  const handleTagToggle = (tag) => {
    setSelectedTags(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tag)) newSet.delete(tag);
      else newSet.add(tag);
      return Array.from(newSet);
    });
  };

  const RightPanel = () => (
    <section class="w-full">
      <div class="mb-3 flex flex-wrap items-center gap-3">
        <ViewModeToggle size="md" />
        <div class="ml-auto flex items-center gap-2 min-w-[220px]">
          <span class="text-xs opacity-70">{t("newTab.category")}</span>
          <select
            class="flex-1 px-3 h-9 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]"
            value={selectedCategory()}
            onInput={(e) => setSelectedCategory(e.currentTarget.value)}
          >
            <For each={categoriesWithAll()}>
              {(c) => <option value={c}>{c === "ALL" ? t("categories.all") : c}</option>}
            </For>
          </select>
        </div>
      </div>
      <ContentFeed
        mode={viewMode()}
        fetchPage={fetchPage}
        pageSize={12}
        resetOn={feedResetKey()}
        isRailVisible={false}
        isActivated={true}
      />
    </section>
  );

  return (
    <Switch>
      <Match when={!tagsResource.loading && tagsResource()?.length > 0}>
        <div class="grid grid-cols-[180px_minmax(0,1fr)] gap-6 items-start">
          <aside class="sticky top-[120px]">
            <h4 class="text-sm font-semibold mb-2">{t("profile.tabs.tags")}</h4>
            <TagList
              tags={tagsResource()}
              loading={tagsResource.loading}
              selectedTags={selectedTags()}
              onTagToggle={handleTagToggle}
            />
          </aside>
          <RightPanel />
        </div>
      </Match>
      <Match when={true}>
        <RightPanel />
      </Match>
    </Switch>
  );
}