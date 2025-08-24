// src/pages/PostPage.jsx
import { createMemo, createResource, Show, Match, Switch, createEffect, createSignal } from "solid-js";
import { useHashRouter, navigate } from "../routing/hashRouter";
import { useApp } from "../context/AppContext.jsx";
import ClosePageButton from "../components/ui/ClosePageButton";
import Spinner from "../components/ui/Spinner.jsx";
import { toChecksumAddress } from "../blockchain/utils.js";
import LangSelector from "../components/ui/LangSelector.jsx";
import IpfsImage from "../components/ui/IpfsImage.jsx";
import UserCard from "../components/ui/UserCard.jsx";
import PostInfo from "../components/feed/PostInfo.jsx";

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
  
  const [postLang, setPostLang] = createSignal(null);

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
      const availableLangs = Object.keys(p.savva_content?.locales || {});
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

  const title = createMemo(() => post()?.savva_content?.locales?.[postLang()]?.title || "");
  const text = createMemo(() => post()?.savva_content?.locales?.[postLang()]?.text || "");
  const thumbnail = createMemo(() => post()?.savva_content?.thumbnail);
  const availableLocales = createMemo(() => Object.keys(post()?.savva_content?.locales || {}));

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
                <h1 class="text-2xl lg:text-3xl font-bold break-words">{title()}</h1>
                <UserCard author={post().author} />
                <PostInfo 
                  item={post()} 
                  hideTopBorder={true} 
                  timeFormat="long"
                  rewardsAlign="left" 
                />
              </div>
              
              {/* --- MODIFICATION: Added flex classes to center children --- */}
              <div class="w-48 flex flex-col items-center flex-shrink-0 space-y-2">
                <Show when={thumbnail()}>
                  <IpfsImage 
                    src={thumbnail()} 
                    class="w-full aspect-video rounded-md object-cover border border-[hsl(var(--border))]" 
                    alt="Post thumbnail"
                  />
                </Show>
                {/* --- MODIFICATION: Removed the variant prop --- */}
                <LangSelector 
                  codes={availableLocales()}
                  value={postLang()}
                  onChange={setPostLang}
                />
              </div>
            </header>

            <div class="prose prose-sm md:prose-base max-w-none pt-4 border-t border-[hsl(var(--border))]">
              <p>{text()}</p>
            </div>
          </article>
        </Match>
      </Switch>
    </main>
  );
}