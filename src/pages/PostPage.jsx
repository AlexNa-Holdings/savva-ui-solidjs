// src/pages/PostPage.jsx
import { createMemo, createResource, Show, Match, Switch } from "solid-js";
import { useHashRouter } from "../routing/hashRouter";
import { useApp } from "../context/AppContext.jsx";
import ClosePageButton from "../components/ui/ClosePageButton";
import Spinner from "../components/ui/Spinner.jsx";
import { toChecksumAddress } from "../blockchain/utils.js";

// Extracts SAVVA_ID from '/post/SAVVA_ID'
const getPostId = (route) => route().split('/')[2] || "";

// Fetches a single post by its savva_cid
async function fetchPost(params) {
  const { savvaId, app, lang } = params;
  if (!savvaId || !app.wsMethod) return null;

  const contentGet = app.wsMethod("content-get");
  const requestParams = {
    domain: app.selectedDomainName(),
    savva_cid: savvaId,
    lang: lang,
  };
  
  const user = app.authorizedUser();
  if (user?.address) {
    requestParams.my_addr = toChecksumAddress(user.address);
  }

  return await contentGet(requestParams);
}

export default function PostPage() {
  const app = useApp();
  const { t } = app;
  const { route } = useHashRouter();
  const savvaId = createMemo(() => getPostId(route));
  const lang = createMemo(() => (app.lang?.() || "en").toLowerCase());

  const [post] = createResource(
    () => ({ savvaId: savvaId(), app, lang: lang() }), // Dependencies for the fetcher
    fetchPost
  );

  return (
    <main class="p-4 max-w-3xl mx-auto">
      <ClosePageButton />
      
      <Switch>
        <Match when={post.loading}>
          <div class="flex justify-center items-center h-64">
            <Spinner class="w-8 h-8" />
          </div>
        </Match>
        <Match when={post.error}>
          <div class="p-4 rounded border border-[hsl(var(--destructive))] bg-[hsl(var(--card))]">
            <h3 class="font-semibold text-[hsl(var(--destructive))]">{t("common.error")}</h3>
            <p class="text-sm mt-1">{post.error.message}</p>
          </div>
        </Match>
        <Match when={post()}>
          <article class="space-y-4">
            {/* TODO: Create and use smaller components for a clean structure.
              For example:
              - <PostHeader author={post().author} timestamp={post().effective_time} />
              - <PostBody content={post().savva_content} />
              - <PostActions post={post()} />
            */}
            <h2 class="text-2xl font-bold">{post().savva_content?.locales?.[lang()]?.title || "..."}</h2>
            <div>
              <p>{post().savva_content?.locales?.[lang()]?.text_preview || "..."}</p>
            </div>
            <pre class="text-xs p-2 bg-[hsl(var(--muted))] rounded overflow-x-auto">
              {JSON.stringify(post(), null, 2)}
            </pre>
          </article>
        </Match>
      </Switch>
    </main>
  );
}