// src/x/profile/PostsTab.jsx
import { createSignal, createResource, createMemo, For } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import ContentFeed from "../feed/ContentFeed.jsx";
import ViewModeToggle, { viewMode } from "../ui/ViewModeToggle.jsx";
import { toChecksumAddress } from "../../blockchain/utils.js";
import { useDomainCategories } from "../../hooks/useDomainCategories.js";
import useUserProfile, { selectField } from "../profile/userProfileStore";
import { loadNsfwPreference } from "../preferences/storage.js";

async function fetchUserCategories({ app, user_addr, lang }) {
  if (!app.wsMethod || !user_addr || !lang) return [];
  try {
    const getCats = app.wsMethod("get-user-categories");
    const res = await getCats({
      domain: app.selectedDomainName(),
      user_addr,
      locale: lang,
    });
    return Array.isArray(res) ? res.map(String) : [];
  } catch (e) {
    console.error("Failed to fetch user categories:", e);
    return [];
  }
}

export default function PostsTab(props) {
  const app = useApp();
  const { t } = app;
  const lang = () => app.lang();
  const user = () => props.user;

  // Tag selection is owned by ProfilePage (the tag list lives in the left column)
  const selectedTags = () => props.selectedTags || [];
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

  const [userCategories] = createResource(() => ({
    app,
    user_addr: user()?.address,
    lang: lang()
  }), fetchUserCategories);

  const domainCategories = useDomainCategories(app);

  // Only categories the user actually has posts in; keep the domain's ordering,
  // append any user categories the domain list doesn't know about.
  const categoriesWithAll = createMemo(() => {
    const mine = userCategories() || [];
    const mineSet = new Set(mine);
    const ordered = (domainCategories() || []).filter((c) => mineSet.has(c));
    const orderedSet = new Set(ordered);
    const extra = mine.filter((c) => !orderedSet.has(c)).sort();
    return ["ALL", ...ordered, ...extra];
  });

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

    const tag = selectedTags()[0];
    if (tag) params.tag = `${lang()}:${tag}`;

    try {
      const res = await contentList(params);
      const arr = Array.isArray(res) ? res : Array.isArray(res?.list) ? res.list : [];
      return arr.map((it) => ({ id: it.savva_cid, _raw: it }));
    } catch (err) {
      console.error("PostsTab fetchPage error:", err);
      return [];
    }
  }

  return (
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
}
