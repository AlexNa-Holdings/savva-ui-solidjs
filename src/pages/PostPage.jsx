// src/pages/PostPage.jsx
import { createMemo, createResource, Show, Match, Switch, createEffect, createSignal } from "solid-js";
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

function rehypeRewriteLinks(options = {}) {
  return (tree) =>
    import("unist-util-visit").then(({ visit }) => {
      if (!options.base) return;
      const base = options.base.endsWith('/') ? options.base : `${options.base}/`;
      const isRelative = (url) => !/^(#|\/|[a-z]+:)/i.test(url);
      
      visit(tree, "element", (node) => {
        if (node.tagName === 'a' || node.tagName === 'img') {
          const prop = node.tagName === 'a' ? 'href' : 'src';
          const url = node.properties?.[prop];
          if (typeof url === 'string' && isRelative(url)) {
            node.properties[prop] = base + url;
          }
        }
      });
    });
}

const getIdentifier = (route) => route().split('/')[2] || "";

async function fetchPostByIdentifier(params) {
  const { identifier, app, lang } = params;
  if (!identifier || !app.wsMethod) return null;
  const contentList = app.wsMethod("content-list");
  const requestParams = {
    domain: app.selectedDomainName(),
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
  let descriptorPath;
  let dataCidForContent;
  if (mainPost.data_cid) {
    descriptorPath = mainPost.ipfs;
    dataCidForContent = mainPost.data_cid;
  } else {
    descriptorPath = `${mainPost.ipfs}/info.yaml`;
    dataCidForContent = mainPost.ipfs;
  }
  dbg.log('PostPage', 'Determined paths', { descriptorPath, dataCidForContent });
  if (!descriptorPath) return { descriptor: null, dataCidForContent };
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

async function fetchMainContent(details, app, lang) {
  if (!details?.descriptor || !lang) return "";
  const { descriptor, dataCidForContent } = details;
  const localizedDescriptor = descriptor.locales?.[lang];
  if (!localizedDescriptor) return "";
  if (localizedDescriptor.data) {
    return localizedDescriptor.data;
  }
  if (localizedDescriptor.data_path && dataCidForContent) {
    const contentPath = `${dataCidForContent}/${localizedDescriptor.data_path}`;
    try {
      const { res } = await ipfs.fetchBest(app, contentPath);
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

  const [post] = createResource(
    () => ({ identifier: identifier(), app, lang: uiLang() }),
    fetchPostByIdentifier
  );
  
  const [details] = createResource(post, (p) => fetchPostDetails(p, app));
  const [postLang, setPostLang] = createSignal(null);
  
  const [mainContent] = createResource(
    () => ({ details: details(), lang: postLang() }), 
    ({ details, lang }) => fetchMainContent(details, app, lang)
  );

  createEffect(() => {
    const p = post();
    const id = identifier();
    if (p && id.startsWith("0x") && p.short_cid) {
      const newPath = `/post/${p.short_cid}`;
      navigate(newPath, { replace: true });
    }
  });

  createEffect(() => {
    const p = post();
    if (p && !postLang()) {
      const availableLangs = Object.keys(details()?.descriptor?.locales || p.savva_content?.locales || {});
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

  const title = createMemo(() => details()?.descriptor?.locales?.[postLang()]?.title || post()?.savva_content?.locales?.[postLang()]?.title || "");
  const thumbnail = createMemo(() => {
    const d = details();
    if (!d) return null;
    const dataCid = d.dataCidForContent;
    const thumbnailPath = d.descriptor?.thumbnail || post()?.savva_content?.thumbnail;
    if (dataCid && thumbnailPath) {
      return `${dataCid}/${thumbnailPath.replace(/^\//, '')}`;
    }
    return null;
  });
  const availableLocales = createMemo(() => Object.keys(details()?.descriptor?.locales || post()?.savva_content?.locales || {}));
  const localizedMainContent = createMemo(() => mainContent());
  
  const ipfsBaseUrl = createMemo(() => {
    const dataCid = details()?.dataCidForContent;
    if (!dataCid) return "";
    const gateway = app.activeIpfsGateways()[0] || "http://127.0.0.1:8080/";
    return `${gateway}ipfs/${dataCid}`;
  });

  const markdownPlugins = createMemo(() => [
    [rehypeRewriteLinks, { base: ipfsBaseUrl() }]
  ]);

  return (
    <main class="p-4 max-w-3xl mx-auto">
      <ClosePageButton />
      
      <Switch>
        <Match when={post.loading}>
          <div class="flex justify-center items-center h-64"><Spinner class="w-8 h-8" /></div>
        </Match>
        <Match when={post.error || details()?.descriptor?.error}>
          <div class="p-4 rounded border border-[hsl(var(--destructive))] bg-[hsl(var(--card))]">
            <h3 class="font-semibold text-[hsl(var(--destructive))]">{t("common.error")}</h3>
            <p class="text-sm mt-1">{post.error?.message || details()?.descriptor?.error}</p>
          </div>
        </Match>
        <Match when={!post.loading && post() === null}>
          <div class="p-4 rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-center">
            <h3 class="font-semibold">{t("post.notFound.title")}</h3>
            <p class="text-sm mt-1 text-[hsl(var(--muted-foreground))]">{t("post.notFound.message")}</p>
          </div>
        </Match>
        <Match when={post()}>
          <article class="space-y-4">
            <header class="flex justify-between items-start gap-4">
              <div class="flex-1 min-w-0 space-y-3">
                <h1 class="text-2xl lg:text-3xl font-bold break-words">{title() || t('common.loading')}</h1>
                <UserCard author={post().author} />
                <PostInfo 
                  item={post()} 
                  hideTopBorder={true} 
                  timeFormat="long"
                  rewardsAlign="left" 
                />
              </div>
              <div class="w-48 flex flex-col items-center flex-shrink-0 space-y-2">
                <Show when={thumbnail()}>
                  {(src) => (
                    <IpfsImage 
                      src={src()} 
                      class="w-full aspect-video rounded-md object-cover border border-[hsl(var(--border))]" 
                      alt="Post thumbnail"
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

            {/* --- MODIFICATION: New two-column layout for the body --- */}
            <div class="flex items-start gap-4 pt-4 border-t border-[hsl(var(--border))]">
              {/* Left Column: Main Content */}
              <div class="flex-1 min-w-0">
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
                  </Match>
                </Switch>
              </div>

              {/* Right Column: Placeholder */}
              <aside class="w-48 flex-shrink-0 space-y-2">
                <div class="h-64 rounded-md border border-dashed border-[hsl(var(--border))] flex items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
                  Right Column
                </div>
              </aside>
            </div>
          </article>
        </Match>
      </Switch>
    </main>
  );
}