// src/x/pages/PostPage.jsx
import { createMemo, createResource, Show, Match, Switch, createEffect, createSignal } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { useHashRouter, navigate } from "../../routing/hashRouter.js";
import { useApp } from "../../context/AppContext.jsx";
import { ipfs } from "../../ipfs/index.js";
import { parse } from "yaml";
import { dbg } from "../../utils/debug.js";
import ClosePageButton from "../ui/ClosePageButton.jsx";
import Spinner from "../ui/Spinner.jsx";
import { toChecksumAddress } from "../../blockchain/utils.js";
import LangSelector from "../ui/LangSelector.jsx";
import IpfsImage from "../ui/IpfsImage.jsx";
import UserCard from "../ui/UserCard.jsx";
import PostInfo from "../feed/PostInfo.jsx";
import MarkdownView from "../docs/MarkdownView.jsx";
import UnknownUserIcon from "../ui/icons/UnknownUserIcon.jsx";
import ChapterSelector from "../post/ChapterSelector.jsx";
import ChapterPager from "../post/ChapterPager.jsx";
import PostTags from "../post/PostTags.jsx";
import { getPostContentBaseCid, getPostDescriptorPath, resolvePostCidPath } from "../../ipfs/utils.js";
import { rehypeRewriteLinks } from "../../docs/rehype-rewrite-links.js";
import ContextMenu from "../ui/ContextMenu.jsx";
import { getPostAdminItems } from "../../ui/contextMenuBuilder.js";
import PostControls from "../post/PostControls.jsx";
import PostComments from "../post/PostComments.jsx";
import PostFundCard from "../post/PostFundCard.jsx";
import FundraisingCard from "../post/FundraisingCard.jsx";
import CampaignContributeModal from "../modals/CampaignContributeModal.jsx";
import PostRightPanel from "../post/PostRightPanel.jsx";
import { fetchDescriptorWithFallback } from "../../ipfs/fetchDescriptorWithFallback.js";

const getIdentifier = (route) => route().split('/')[2] || "";

async function fetchPostByIdentifier(params) {
  const { identifier, domain, app, lang } = params;
  if (!identifier || !domain || !app.wsMethod) return null;
  const contentList = app.wsMethod("content-list");
  const requestParams = { domain, lang, limit: 1 };
  if (identifier.startsWith("0x")) {
    requestParams.savva_cid = identifier;
  } else {
    requestParams.short_cid = identifier;
  }
  const user = app.authorizedUser();
  if (user?.address) requestParams.my_addr = toChecksumAddress(user.address);
  const res = await contentList(requestParams);
  const arr = Array.isArray(res) ? res : Array.isArray(res?.list) ? res.list : [];
  return arr[0] || null;
}

async function fetchPostDetails(mainPost, app) {
  if (!mainPost) return null;

  const descriptorPath = getPostDescriptorPath(mainPost);
  const dataCidForContent = getPostContentBaseCid(mainPost);

  dbg.log("PostPage", "Determined paths", { descriptorPath, dataCidForContent });

  if (!descriptorPath) {
    return { descriptor: null, dataCidForContent };
  }

  try {
    // Uses runtime fallback: primary path, then <cid>/info.yaml> if HTML/dir index.
    const { text, finalPath, usedFallback } = await fetchDescriptorWithFallback(
      app,
      mainPost,
      (path) => ipfs.fetchBest(app, path).then(x => x.res)
    );

    dbg.log("PostPage", "descriptor loaded", { finalPath, usedFallback });

    const descriptor = parse(text) || null;
    return { descriptor, dataCidForContent };
  } catch (error) {
    dbg.error("PostPage", "Failed to fetch or parse descriptor", { path: descriptorPath, error });
    return { descriptor: { error: error.message }, dataCidForContent };
  }
}

async function fetchMainContent(details, app, lang, chapterIndex) {
  if (!details?.descriptor || !lang) return "";

  const { descriptor, dataCidForContent } = details;
  const localizedDescriptor = descriptor.locales?.[lang];
  if (!localizedDescriptor) return "";

  let contentPath;
  if (chapterIndex === 0) {
    if (localizedDescriptor.data) return localizedDescriptor.data;
    if (localizedDescriptor.data_path) {
      contentPath = `${dataCidForContent}/${localizedDescriptor.data_path}`;
    }
  } else {
    const chapter = localizedDescriptor.chapters?.[chapterIndex - 1];
    if (chapter?.data_path) {
      contentPath = `${dataCidForContent}/${chapter.data_path}`;
    }
  }

  if (contentPath) {
    try {
      const postGateways = details.descriptor?.gateways || [];
      const { res } = await ipfs.fetchBest(app, contentPath, { postGateways });
      return await res.text();
    } catch (error) {
      dbg.error('PostPage', 'Failed to fetch main content', { path: contentPath, error });
      return `## Error loading content\n\n\`\`\`\n${error.message}\n\`\`\``;
    }
  }

  return "";
}

export default function PostPage() {
  const app = useApp();
  const { t } = app;
  const { route } = useHashRouter();
  const identifier = createMemo(() => getIdentifier(route));
  const uiLang = createMemo(() => (app.lang?.() || "en").toLowerCase());

  const [showContributeModal, setShowContributeModal] = createSignal(false);
  const [contributeCampaignId, setContributeCampaignId] = createSignal(null);

  const [postResource] = createResource(
    () => ({ identifier: identifier(), domain: app.selectedDomainName(), app, lang: uiLang() }),
    fetchPostByIdentifier
  );

  const [post, setPost] = createStore(null);

  createEffect(() => {
    const resourceData = postResource();
    if (resourceData) setPost(reconcile(resourceData));
  });

  const [details] = createResource(postResource, (p) => fetchPostDetails(p, app));
  const [postLang, setPostLang] = createSignal(null);
  const [selectedChapterIndex, setSelectedChapterIndex] = createSignal(0);

  const [mainContent] = createResource(
    () => ({ details: details(), lang: postLang(), chapterIndex: selectedChapterIndex() }),
    ({ details, lang, chapterIndex }) => fetchMainContent(details, app, lang, chapterIndex)
  );

  createEffect(() => {
    const p = post;
    const id = identifier();
    if (p && id.startsWith("0x") && p.short_cid) {
      const newPath = `/post/${p.short_cid}`;
      navigate(newPath, { replace: true });
    }
  });

  createEffect(() => {
    const update = app.postUpdate();
    if (post && update && update.cid === post.savva_cid) {
      if (update.type === 'reactionsChanged') {
        setPost('reactions', reconcile(update.data.reactions));
        if (app.authorizedUser()?.address?.toLowerCase() === update.data?.user?.toLowerCase()) {
          setPost('my_reaction', update.data.reaction);
        }
      } else if (update.type === 'fundChanged' && update.data.fund) {
        setPost('fund', (prevFund) => reconcile({ ...prevFund, ...update.data.fund }));
      }
    }
  });

  createEffect(() => {
    if (post && !postLang()) {
      const availableLangs = Object.keys(details()?.descriptor?.locales || post.savva_content?.locales || {});
      if (availableLangs.length === 0) return;
      const currentUiLang = uiLang();
      let initialLang = availableLangs[0];
      if (availableLangs.includes(currentUiLang)) initialLang = currentUiLang;
      else if (availableLangs.includes('en')) initialLang = 'en';
      setPostLang(initialLang);
    }
  });

  createEffect(() => {
    const d = details();
    if (!d?.descriptor) return;
    const locales = d.descriptor.locales || {};
    const available = Object.keys(locales);
    if (available.length === 0) return;
    const ui = uiLang();
    setPostLang(available.includes(ui) ? ui : available[0]);
  });

  const postForTags = createMemo(() => {
    const d = details();
    const lang = postLang();
    const loc = d?.descriptor?.locales?.[lang] || {};
    return {
      savva_content: {
        locales: {
          [lang || "en"]: {
            categories: Array.isArray(loc.categories) ? loc.categories : [],
            tags: Array.isArray(loc.tags) ? loc.tags : [],
          },
        },
      },
    };
  });

  const contextMenuItems = createMemo(() => {
    if (!post) return [];
    return getPostAdminItems(post, t);
  });

  const title = createMemo(
    () => details()?.descriptor?.locales?.[postLang()]?.title || post?.savva_content?.locales?.[postLang()]?.title || ""
  );
  const thumbnail = createMemo(() => {
    if (!post) return null;
    const d = details();
    const thumbnailPath = d?.descriptor?.thumbnail || post.savva_content?.thumbnail;
    return resolvePostCidPath(post, thumbnailPath);
  });
  const availableLocales = createMemo(() =>
    Object.keys(details()?.descriptor?.locales || post?.savva_content?.locales || {})
  );

  const chapterList = createMemo(() => {
    const prologue = { title: t("post.chapters.prologue"), data_path: null };
    const chapters = details()?.descriptor?.locales?.[postLang()]?.chapters || [];
    return [prologue, ...chapters];
  });

  const postSpecificGateways = createMemo(() => details()?.descriptor?.gateways || []);
  const localizedMainContent = createMemo(() => mainContent());

  const ipfsBaseUrl = createMemo(() => {
    const d = details();
    if (!d) return "";
    const dataCid = d.dataCidForContent;
    if (!dataCid) return "";

    let bestGateway;
    if (app.localIpfsEnabled() && app.localIpfsGateway()) {
      bestGateway = app.localIpfsGateway();
    } else if (Array.isArray(postSpecificGateways()) && postSpecificGateways().length > 0) {
      bestGateway = postSpecificGateways()[0];
    } else {
      bestGateway = app.remoteIpfsGateways()[0] || "https://ipfs.io/";
    }

    return ipfs.buildUrl(bestGateway, dataCid);
  });

  function openContributeModal(campaignId) {
    setContributeCampaignId(campaignId);
    setShowContributeModal(true);
  }

  const markdownPlugins = createMemo(() => [[rehypeRewriteLinks, { base: ipfsBaseUrl() }]]);

  return (
    <main class="sv-container p-4">
      <ClosePageButton />
      <Switch>
        <Match when={postResource.loading}>
          <div class="flex justify-center items-center h-64"><Spinner class="w-8 h-8" /></div>
        </Match>
        <Match when={postResource.error || details()?.descriptor?.error}>
          <div class="p-4 rounded border border-[hsl(var(--destructive))] bg-[hsl(var(--card))]">
            <h3 class="font-semibold text-[hsl(var(--destructive))]">{t("common.error")}</h3>
            <p class="text-sm mt-1">{postResource.error?.message || details()?.descriptor?.error}</p>
          </div>
        </Match>
        <Match when={!postResource.loading && !post}>
          <div class="p-4 rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-center">
            <h3 class="font-semibold">{t("post.notFound.title")}</h3>
            <p class="text-sm mt-1 text-[hsl(var(--muted-foreground))]">{t("post.notFound.message")}</p>
          </div>
        </Match>
        <Match when={post}>
          <div class="max-w-5xl mx-auto">
            <article class="space-y-4">
              <header class="flex justify-between items-start gap-4">
                <div class="flex-1 min-w-0 space-y-3">
                  <h1 class="text-2xl lg:text-3xl font-bold break-words">{title() || t('common.loading')}</h1>

                  <div class="flex items-center justify-between gap-3">
                    <UserCard author={post.author} />
                    <Show when={app.authorizedUser()?.isAdmin && contextMenuItems().length > 0}>
                      <ContextMenu
                        items={contextMenuItems()}
                        positionClass="relative z-20"
                        buttonClass="p-1 rounded-md bg-[hsl(var(--background))] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
                      />
                    </Show>
                  </div>
                  <PostTags postData={postForTags()} />
                </div>

                <div class="w-48 flex flex-col items-center flex-shrink-0 space-y-2">
                  <Show when={thumbnail()}>
                    {(src) => (
                      <IpfsImage
                        src={src()}
                        class="w-full aspect-video rounded-md object-cover border border-[hsl(var(--border))]"
                        alt="Post thumbnail"
                        postGateways={postSpecificGateways()}
                        fallback={<UnknownUserIcon class="w-full h-full object-contain p-4 text-[hsl(var(--muted-foreground))]" />}
                      />
                    )}
                  </Show>
                  <LangSelector
                    codes={availableLocales()}
                    value={postLang()}
                    onChange={setPostLang}
                  />
                </div>
              </header>

              <div class="pt-4 border-t border-[hsl(var(--border))]">
                {/* Responsive: 1 col on mobile, 2 cols on lg+ */}
                <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_12rem] gap-6 items-start">
                  <div>
                    <Show when={(chapterList()?.length || 0) > 1}>
                      <div class="flex justify-end mb-4">
                        <ChapterSelector
                          chapters={chapterList()}
                          selectedIndex={selectedChapterIndex()}
                          onSelect={setSelectedChapterIndex}
                        />
                      </div>
                    </Show>
                    <Switch>
                      <Match when={details.loading || mainContent.loading}>
                        <div class="flex justify-center p-8"><Spinner /></div>
                      </Match>
                      <Match when={mainContent.error}>
                        <p class="text-sm text-[hsl(var(--destructive))]">Error loading content: {mainContent.error.message}</p>
                      </Match>
                      <Match when={localizedMainContent()}>
                        <MarkdownView
                          markdown={localizedMainContent()}
                          rehypePlugins={markdownPlugins()}
                        />
                        <Show when={(chapterList()?.length || 0) > 1}>
                          <ChapterPager
                            chapters={chapterList()}
                            currentIndex={selectedChapterIndex()}
                            onSelect={setSelectedChapterIndex}
                          />
                        </Show>
                      </Match>
                    </Switch>

                    <PostControls post={post} />

                    {/* Mobile: Right panel content in-flow, before comments */}
                    <div class="mt-6 block lg:hidden space-y-2">
                      <Show when={details()?.descriptor?.fundraiser > 0}>
                        <FundraisingCard
                          campaignId={details().descriptor.fundraiser}
                          onContribute={openContributeModal}
                        />
                      </Show>
                      <Show when={post}>
                        <PostFundCard post={post} />
                      </Show>
                    </div>

                    <PostComments post={post} />
                  </div>

                  {/* Desktop right rail (sticky/clamped). Hidden on small screens */}
                  <PostRightPanel post={post} details={details} onOpenContributeModal={openContributeModal} />
                </div>
              </div>
            </article>
          </div>
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
