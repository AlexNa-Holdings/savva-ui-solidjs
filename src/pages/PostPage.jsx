// src/pages/PostPage.jsx
import { createMemo, createResource, Show, Match, Switch, createEffect, createSignal } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { useHashRouter, navigate } from "../routing/hashRouter";
import { useApp } from "../context/AppContext.jsx";
import { ipfs } from "../ipfs/index.js";
import { parse } from "yaml";
import { dbg } from "../utils/debug.js";
import ClosePageButton from "../components/ui/ClosePageButton";
import Spinner from "../components/ui/Spinner.jsx";
import { toChecksumAddress } from "../blockchain/utils.js";
import LangSelector from "../components/ui/LangSelector.jsx";
import IpfsImage from "../components/ui/IpfsImage.jsx";
import UserCard from "../components/ui/UserCard.jsx";
import PostInfo from "../components/feed/PostInfo.jsx";
import MarkdownView from "../components/docs/MarkdownView.jsx";
import UnknownUserIcon from "../components/ui/icons/UnknownUserIcon.jsx";
import ChapterSelector from "../components/post/ChapterSelector.jsx";
import ChapterPager from "../components/post/ChapterPager.jsx";
import PostTags from "../components/post/PostTags.jsx";
import { getPostContentBaseCid, getPostDescriptorPath, resolvePostCidPath } from "../ipfs/utils.js";
import { rehypeRewriteLinks } from "../docs/rehype-rewrite-links.js";
import ContextMenu from "../components/ui/ContextMenu.jsx";
import { getPostAdminItems } from "../ui/contextMenuBuilder.js";
import PostControls from "../components/post/PostControls.jsx";
import PostComments from "../components/post/PostComments.jsx";


const getIdentifier = (route) => route().split('/')[2] || "";

async function fetchPostByIdentifier(params) {
  const { identifier, domain, app, lang } = params;
  if (!identifier || !domain || !app.wsMethod) return null;
  const contentList = app.wsMethod("content-list");
  const requestParams = {
    domain: domain,
    lang: lang,
    limit: 1,
  };
  if (identifier.startsWith("0x")) {
    requestParams.savva_cid = identifier;
  } else {
    requestParams.short_cid = identifier;
  }
  const user = app.authorizedUser();
  if (user?.address) {
    requestParams.my_addr = toChecksumAddress(user.address);
  }
  const res = await contentList(requestParams);
  const arr = Array.isArray(res) ? res : Array.isArray(res?.list) ? res.list : [];
  return arr[0] || null;
}

async function fetchPostDetails(mainPost, app) {
  if (!mainPost) return null;
  
  const descriptorPath = getPostDescriptorPath(mainPost);
  const dataCidForContent = getPostContentBaseCid(mainPost);

  dbg.log('PostPage', 'Determined paths', { descriptorPath, dataCidForContent });

  if (!descriptorPath) {
    return { descriptor: null, dataCidForContent };
  }

  try {
    const { res } = await ipfs.fetchBest(app, descriptorPath);
    const text = await res.text();
    const descriptor = parse(text) || null;
    return { descriptor, dataCidForContent };
  } catch (error) {
    dbg.error('PostPage', 'Failed to fetch or parse descriptor', { path: descriptorPath, error });
    return { descriptor: { error: error.message }, dataCidForContent };
  }
}

async function fetchMainContent(details, app, lang, chapterIndex) {
  if (!details?.descriptor || !lang) return "";

  const { descriptor, dataCidForContent } = details;
  const localizedDescriptor = descriptor.locales?.[lang];
  if (!localizedDescriptor) return "";

  let contentPath;
  if (chapterIndex === 0) { // Prologue (main content)
    if (localizedDescriptor.data) return localizedDescriptor.data;
    if (localizedDescriptor.data_path) {
      contentPath = `${dataCidForContent}/${localizedDescriptor.data_path}`;
    }
  } else { // A specific chapter
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

  const [postResource] = createResource(
    () => ({
      identifier: identifier(),
      domain: app.selectedDomainName(),
      app,
      lang: uiLang()
    }),
    fetchPostByIdentifier
  );
  
  const [post, setPost] = createStore(null);

  createEffect(() => {
    const resourceData = postResource();
    if (resourceData) {
      setPost(reconcile(resourceData));
    }
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
    if (post && update && update.type === 'reactionsChanged' && update.cid === post.savva_cid) {
      setPost('reactions', update.data.reactions);
      if (app.authorizedUser()?.address?.toLowerCase() === update.data?.user?.toLowerCase()) {
        setPost('my_reaction', update.data.reaction);
      }
    }
  });

  createEffect(() => {
    if (post && !postLang()) {
      const availableLangs = Object.keys(details()?.descriptor?.locales || post.savva_content?.locales || {});
      if (availableLangs.length === 0) return;
      const currentUiLang = uiLang();
      let initialLang = availableLangs[0]; 
      if (availableLangs.includes(currentUiLang)) {
        initialLang = currentUiLang;
      } else if (availableLangs.includes('en')) {
        initialLang = 'en';
      }
      setPostLang(initialLang);
    }
  });

  const contextMenuItems = createMemo(() => {
    if (!post) return [];
    return getPostAdminItems(post, t);
  });

  const title = createMemo(() => details()?.descriptor?.locales?.[postLang()]?.title || post?.savva_content?.locales?.[postLang()]?.title || "");
  const thumbnail = createMemo(() => {
    if (!post) return null;
    const d = details();
    const thumbnailPath = d?.descriptor?.thumbnail || post.savva_content?.thumbnail;
    return resolvePostCidPath(post, thumbnailPath);
  });
  const availableLocales = createMemo(() => Object.keys(details()?.descriptor?.locales || post?.savva_content?.locales || {}));
  
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

  const markdownPlugins = createMemo(() => [
    [rehypeRewriteLinks, { base: ipfsBaseUrl() }]
  ]);

  const RightPanel = () => (
    <aside class="sticky top-16">
      <div 
        class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] overflow-hidden"
        style={{ "max-height": `calc(100vh - 5rem)` }}
      >
        <div class="p-4 space-y-3 overflow-y-auto h-full">
          <h4 class="font-semibold">Right Panel</h4>
          <p class="text-sm text-[hsl(var(--muted-foreground))]">
            This panel behaves like the main screen's right rail. It sticks to the top, and this content area will scroll if it's too long.
          </p>
        </div>
      </div>
    </aside>
  );

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
                <div class="relative flex-1 min-w-0 space-y-3">
                  <h1 class="text-2xl lg:text-3xl font-bold break-words pr-12">{title() || t('common.loading')}</h1>
                  
                  <Show when={app.authorizedUser()?.isAdmin && contextMenuItems().length > 0}>
                    <ContextMenu 
                      items={contextMenuItems()}
                      positionClass="absolute top-0 right-0 z-20"
                    />
                  </Show>
                  <UserCard author={post.author} />
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
                <div class="grid grid-cols-[minmax(0,1fr)_12rem] gap-6 items-start">
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
                    <PostComments post={post} />
                  </div>
                  <RightPanel />
                </div>
              </div>
            </article>
          </div>
          
        </Match>
      </Switch>
    </main>
  );
}