// src/x/pages/PostPage.jsx
import { createMemo, createResource, Show, Match, Switch, createEffect, createSignal } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { useHashRouter, navigate } from "../../routing/hashRouter.js";

import { ipfs } from "../../ipfs/index.js";
import { dbg } from "../../utils/debug.js";
import { toChecksumAddress } from "../../blockchain/utils.js";
import { getPostContentBaseCid } from "../../ipfs/utils.js";
import { rehypeRewriteLinks } from "../../docs/rehype-rewrite-links.js";

import ClosePageButton from "../ui/ClosePageButton.jsx";
import Spinner from "../ui/Spinner.jsx";
import LangSelector from "../ui/LangSelector.jsx";
import IpfsImage from "../ui/IpfsImage.jsx";
import UnknownUserIcon from "../ui/icons/UnknownUserIcon.jsx";
import UserCard from "../ui/UserCard.jsx";
import ContextMenu from "../ui/ContextMenu.jsx";
import MarkdownView from "../docs/MarkdownView.jsx";

import ChapterSelector from "../post/ChapterSelector.jsx";
import ChapterPager from "../post/ChapterPager.jsx";
import PostTags from "../post/PostTags.jsx";
import PostControls from "../post/PostControls.jsx";
import PostComments from "../post/PostComments.jsx";
import PostFundCard from "../post/PostFundCard.jsx";
import FundraisingCard from "../post/FundraisingCard.jsx";
import PostRightPanel from "../post/PostRightPanel.jsx";
import CampaignContributeModal from "../modals/CampaignContributeModal.jsx";
import { getPostAdminItems } from "../../ui/contextMenuBuilder.js";
import { fetchDescriptorWithFallback } from "../../ipfs/fetchDescriptorWithFallback.js";
import BannedBanner from "../post/BannedBanner.jsx";
import PostInfo from "../post/PostInfo.jsx";

// ⬇️ Profile store (same as PostCard)
import useUserProfile, { selectField } from "../profile/userProfileStore.js";

const getIdentifier = (route) => route().split("/")[2] || "";

async function fetchPostByIdentifier(params) {
  const { identifier, domain, app, lang } = params;
  if (!identifier || !domain || !app.wsMethod) return null;

  const contentList = app.wsMethod("content-list");
  const requestParams = { domain, lang, limit: 1, show_nsfw: true };

  if (identifier.startsWith("0x")) requestParams.savva_cid = identifier;
  else requestParams.short_cid = identifier;

  const user = app.authorizedUser?.();
  if (user?.address) requestParams.my_addr = toChecksumAddress(user.address);

  const res = await contentList(requestParams);
  const arr = Array.isArray(res) ? res : Array.isArray(res?.list) ? res.list : [];
  return arr[0] || null;
}

async function fetchPostDetails(mainPost, app) {
  if (!mainPost) return null;
  const dataCidForContent = getPostContentBaseCid(mainPost);

  try {
    const { descriptor } = await fetchDescriptorWithFallback(app, mainPost);
    return { descriptor, dataCidForContent };
  } catch (error) {
    dbg.error("PostPage", "Failed to fetch or parse descriptor", { path: mainPost.ipfs, error });
    return { descriptor: { error: error.message }, dataCidForContent };
  }
}

async function fetchMainContent(details, app, lang, chapterIndex) {
  if (!details?.descriptor || !lang) return "";

  const { descriptor, dataCidForContent } = details;
  const localized = descriptor.locales?.[lang];
  if (!localized) return "";

  let contentPath;
  if (chapterIndex === 0) {
    if (localized.data) return localized.data;
    if (localized.data_path) contentPath = `${dataCidForContent}/${localized.data_path}`;
  } else {
    const chapter = localized.chapters?.[chapterIndex - 1];
    if (chapter?.data_path) contentPath = `${dataCidForContent}/${chapter.data_path}`;
  }

  if (contentPath) {
    try {
      const postGateways = descriptor?.gateways || [];
      const { res } = await ipfs.fetchBest(app, contentPath, { postGateways });
      return await res.text();
    } catch (error) {
      return `## ${app.t("post.loadError")}\n\n\`\`\`\n${error.message}\n\`\`\``;
    }
  }

  return "";
}

export default function PostPage() {
  const app = useApp();
  const { t } = app;
  const { route } = useHashRouter();

  // profile from spec store
  const { dataStable: profile } = useUserProfile();

  const identifier = createMemo(() => getIdentifier(route));
  const uiLang = createMemo(() => (app.lang?.() || "en").toLowerCase());

  const [showContributeModal, setShowContributeModal] = createSignal(false);
  const [contributeCampaignId, setContributeCampaignId] = createSignal(null);

  const [postResource] = createResource(
    () => ({ identifier: identifier(), domain: app.selectedDomainName(), app, lang: uiLang() }),
    fetchPostByIdentifier
  );

  const [post, setPost] = createSignal(null);
  createEffect(() => setPost(postResource() || null));

  const [details] = createResource(postResource, (p) => fetchPostDetails(p, app));
  const [postLang, setPostLang] = createSignal(null);
  const [selectedChapterIndex, setSelectedChapterIndex] = createSignal(0);

  const [mainContent] = createResource(
    () => ({ details: details(), lang: postLang(), chapterIndex: selectedChapterIndex() }),
    ({ details, lang, chapterIndex }) => fetchMainContent(details, app, lang, chapterIndex)
  );

  // normalize to short CID
  createEffect(() => {
    const p = post();
    const id = identifier();
    if (p && id.startsWith("0x") && p.short_cid) navigate(`/post/${p.short_cid}`, { replace: true });
  });

  const bannedFlags = () => {
    const p = post(); // your existing signal/store accessor
    return {
      banned: !!(p?._raw?.banned ?? p?.banned),
      authorBanned: !!(p?._raw?.author_banned ?? p?.author_banned ?? p?.author?.banned),
    };
  };

  const availableLocales = createMemo(() => Object.keys(details()?.descriptor?.locales || {}));
  createEffect(() => {
    const locales = availableLocales();
    const want = uiLang();
    setPostLang(locales.includes(want) ? want : locales[0] || "en");
  });

  const actorAddress = createMemo(() => app.actorAddress?.() || app.authorizedUser?.()?.address || "");

  const title = createMemo(() => {
    const loc = details()?.descriptor?.locales?.[postLang()];
    return (loc?.title || "").trim();
  });

  const postSpecificGateways = createMemo(() => details()?.descriptor?.gateways || []);
  const ipfsBaseUrl = createMemo(() => {
    const d = details();
    if (!d) return "";
    const dataCid = d.dataCidForContent;
    if (!dataCid) return "";

    let bestGateway;
    if (app.localIpfsEnabled() && app.localIpfsGateway()) bestGateway = app.localIpfsGateway();
    else if (Array.isArray(postSpecificGateways()) && postSpecificGateways().length > 0) bestGateway = postSpecificGateways()[0];
    else bestGateway = app.remoteIpfsGateways()[0] || "https://ipfs.io/";
    return ipfs.buildUrl(bestGateway, dataCid);
  });

  const markdownPlugins = createMemo(() => [[rehypeRewriteLinks, { base: ipfsBaseUrl() }]]);
  const localizedMainContent = createMemo(() => mainContent() || "");
  const contextMenuItems = createMemo(() => (post() ? getPostAdminItems(post(), t) : []));
  const postForTags = createMemo(() => post());

  // ---- NSFW (exactly like PostCard) ----
  const nsfwMode = createMemo(() => {
    const p = profile?.();
    return selectField(p, "nsfw") ?? selectField(p, "prefs.nsfw") ?? "h";
  });
  const postIsNsfw = createMemo(() => post()?.nsfw === true);
  const shouldHide = createMemo(() => postIsNsfw() && nsfwMode() === "h");
  const shouldWarn = createMemo(() => postIsNsfw() && nsfwMode() === "w");
  const [revealed, setRevealed] = createSignal(false);

  function openContributeModal(campaignId) {
    setContributeCampaignId(campaignId);
    setShowContributeModal(true);
  }

  return (
    <main class="sv-container p-4">
      <ClosePageButton />
      <Switch>
        <Match when={postResource.loading}>
          <div class="flex justify-center items-center h-64"><Spinner class="w-8 h-8" /></div>
        </Match>

        <Match when={postResource.error || details()?.descriptor?.error}>
          <div class="p-4 rounded border text-center border-[hsl(var(--destructive))] bg-[hsl(var(--card))]">
            <h3 class="font-semibold text-[hsl(var(--destructive))]">{t("common.error")}</h3>
            <p class="text-sm mt-1">{postResource.error?.message || details()?.descriptor?.error}</p>
          </div>
        </Match>

        {/* Empty-state when no content found */}
        <Match when={!postResource.loading && !post()}>
          <div class="p-4 rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-center">
            <h3 class="font-semibold">{t("post.notFound.title")}</h3>
            <p class="text-sm mt-1 text-[hsl(var(--muted-foreground))]">{t("post.notFound.message")}</p>
          </div>
        </Match>

        <Match when={post()}>

          <BannedBanner banned={bannedFlags().banned} authorBanned={bannedFlags().authorBanned} />
      
          {/* Hard hide */}
          <Show when={shouldHide()}>
            <div class="p-4 rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-center">
              <h3 class="font-semibold">{t("post.nsfw.hidden.title")}</h3>
              <p class="text-sm mt-1 text-[hsl(var(--muted-foreground))]">
                {t("post.nsfw.hidden.message")}
              </p>
            </div>
          </Show>

          {/* Show or warn */}
          <Show when={!shouldHide()}>
            <div class="max-w-5xl mx-auto">
              <article class="space-y-4">
                <header class="flex justify-between items-start gap-4">
                  <div class="flex-1 min-w-0 space-y-3">
                    <h1 class="text-2xl lg:text-3xl font-bold break-words">{title() || t("common.loading")}</h1>
                    <div class="flex items-center justify-between gap-3">
                      <UserCard author={post().author} />
                      <Show when={app.authorizedUser()?.isAdmin && contextMenuItems().length > 0}>
                        <ContextMenu
                          items={contextMenuItems()}
                          positionClass="relative z-20"
                          buttonClass="p-1 rounded-md bg-[hsl(var(--background))] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
                        />
                      </Show>
                    </div>
                    <PostTags postData={postForTags()} />
                            <div class="flex-1 min-w-0">
                              {/* Pass actorAddr so child re-renders on actor switch */}
                              <PostInfo item={post()} hideTopBorder={true} timeFormat="long" actorAddr={actorAddress()} />
                            </div>
                  </div>

                  <div class="w-48 flex flex-col items-center flex-shrink-0 space-y-2">
                    <Show when={details()?.descriptor?.thumbnail}>
                      <IpfsImage
                        src={`${details().dataCidForContent}/${details().descriptor.thumbnail}`}
                        class="w-full aspect-video rounded-md object-cover border border-[hsl(var(--border))]"
                        alt={t("post.thumbnailAlt")}
                        postGateways={postSpecificGateways()}
                        fallback={<UnknownUserIcon class="w-full h-full object-contain p-4 text-[hsl(var(--muted-foreground))]" />}
                      />
                    </Show>

                    <LangSelector codes={availableLocales()} value={postLang()} onChange={setPostLang} />
                  </div>
                </header>

                <div class="pt-4 border-t border-[hsl(var(--border))]">
                  <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_12rem] gap-6 items-start">
                    {/* Left column with optional warning cover */}
                    <div class="relative min-h-[12rem]">
                      <Show when={shouldWarn() && !revealed()}>
                        <div class="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-[hsla(var(--background),0.85)] backdrop-blur-sm">
                          <div class="text-center space-y-3 px-6">
                            <h4 class="font-semibold">{t("post.nsfw.warning.title")}</h4>
                            <p class="text-sm text-[hsl(var(--muted-foreground))]">{t("post.nsfw.warning.message")}</p>
                            <button
                              class="px-4 py-2 rounded-md font-medium bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
                              onClick={() => setRevealed(true)}
                            >
                              {t("post.nsfw.warning.show")}
                            </button>
                          </div>
                        </div>
                      </Show>

                      <div class={shouldWarn() && !revealed() ? "select-none pointer-events-none blur-sm" : ""}>
                        <Switch>
                          <Match when={details.loading || mainContent.loading}>
                            <div class="flex justify-center p-8"><Spinner /></div>
                          </Match>
                          <Match when={localizedMainContent()}>
                            <Show when={(details()?.descriptor?.locales?.[postLang()]?.chapters || []).length > 0}>
                              <div class="flex justify-end mb-4">
                                <ChapterSelector
                                  chapters={[
                                    { title: t("post.chapters.prologue") },
                                    ...((details()?.descriptor?.locales?.[postLang()]?.chapters || []).map((ch, i) => ({
                                      title: ch.title || `${t("post.chapters.chapter")} ${i + 1}`
                                    })))
                                  ]}
                                  selectedIndex={selectedChapterIndex()}
                                  onSelect={setSelectedChapterIndex}
                                />
                              </div>
                            </Show>

                            <MarkdownView markdown={localizedMainContent()} rehypePlugins={markdownPlugins()} />

                            <Show when={((details()?.descriptor?.locales?.[postLang()]?.chapters || []).length || 0) > 0}>
                              <ChapterPager
                                chapters={[
                                  { title: t("post.chapters.prologue") },
                                  ...((details()?.descriptor?.locales?.[postLang()]?.chapters || []).map((ch, i) => ({
                                    title: ch.title || `${t("post.chapters.chapter")} ${i + 1}`
                                  })))
                                ]}
                                currentIndex={selectedChapterIndex()}
                                onSelect={setSelectedChapterIndex}
                              />
                            </Show>

                            <PostControls post={post()} />

                            {/* Mobile right rail inline */}
                            <div class="mt-6 block lg:hidden space-y-2">
                              <Show when={details()?.descriptor?.fundraiser > 0}>
                                <FundraisingCard
                                  campaignId={details().descriptor.fundraiser}
                                  onContribute={openContributeModal}
                                />
                              </Show>
                              <Show when={post()}>
                                <PostFundCard post={post()} />
                              </Show>
                            </div>

                            <PostComments post={post()} />
                          </Match>
                        </Switch>
                      </div>
                    </div>

                    {/* Right rail always visible */}
                    <PostRightPanel post={post()} details={details} onOpenContributeModal={openContributeModal} />
                  </div>
                </div>
              </article>
            </div>
          </Show>
        </Match>
      </Switch>

      <CampaignContributeModal
        isOpen={showContributeModal()}
        onClose={() => setShowContributeModal(false)}
        campaignId={contributeCampaignId()}
      />
    </main>
  );
}
