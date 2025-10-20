// src/x/modals/PromoPostPopup.jsx
import { createMemo, createResource, Show, Match, Switch, createSignal, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { ipfs } from "../../ipfs/index.js";
import { fetchBestWithDecryption } from "../../ipfs/encryptedFetch.js";
import { dbg } from "../../utils/debug.js";
import { toChecksumAddress } from "../../blockchain/utils.js";
import { getPostContentBaseCid } from "../../ipfs/utils.js";
import { rehypeRewriteLinks } from "../../docs/rehype-rewrite-links.js";

import Modal from "./Modal.jsx";
import Spinner from "../ui/Spinner.jsx";
import LangSelector from "../ui/LangSelector.jsx";
import MarkdownView from "../docs/MarkdownView.jsx";
import { fetchDescriptorWithFallback } from "../../ipfs/fetchDescriptorWithFallback.js";

const PROMO_DISMISSED_KEY = "promo_post_dismissed";

async function fetchPostByIdentifier(params) {
  const { identifier, domain, app, lang } = params;
  if (!identifier || !domain || !app.wsMethod) return null;

  const contentList = app.wsMethod("content-list");
  const requestParams = { domain, lang, limit: 1, show_nsfw: true };

  const id = String(identifier || "");
  if (id.startsWith("0x")) requestParams.savva_cid = id;
  else requestParams.short_cid = id;

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
    dbg.error("PromoPostPopup", "Failed to fetch or parse descriptor", { path: mainPost.ipfs, error });
    return { descriptor: { error: error.message }, dataCidForContent };
  }
}

async function fetchMainContent(details, app, lang) {
  if (!details?.descriptor || !lang) return "";

  const { descriptor, dataCidForContent } = details;
  const localized = descriptor.locales?.[lang];
  if (!localized) return "";

  let contentPath;
  // Only fetch prologue (chapter 0)
  if (localized.data) return localized.data;
  if (localized.data_path) contentPath = `${dataCidForContent}/${localized.data_path}`;

  if (contentPath) {
    try {
      const postGateways = descriptor?.gateways || [];
      const { res } = await fetchBestWithDecryption(app, contentPath, { postGateways });
      const rawContent = await res.arrayBuffer();
      return new TextDecoder().decode(rawContent);
    } catch (error) {
      return `## ${app.t("post.loadError")}\n\n\`\`\`\n${error.message}\n\`\`\``;
    }
  }

  return "";
}

/**
 * Check if the promo post was already dismissed for this specific post ID
 */
function isPromoDismissed(postId) {
  try {
    const dismissed = localStorage.getItem(PROMO_DISMISSED_KEY);
    if (!dismissed) return false;
    const dismissedList = JSON.parse(dismissed);
    return Array.isArray(dismissedList) && dismissedList.includes(postId);
  } catch {
    return false;
  }
}

/**
 * Mark the promo post as dismissed
 */
function dismissPromo(postId) {
  try {
    const dismissed = localStorage.getItem(PROMO_DISMISSED_KEY);
    let dismissedList = [];
    if (dismissed) {
      try {
        dismissedList = JSON.parse(dismissed);
        if (!Array.isArray(dismissedList)) dismissedList = [];
      } catch {
        dismissedList = [];
      }
    }
    if (!dismissedList.includes(postId)) {
      dismissedList.push(postId);
      localStorage.setItem(PROMO_DISMISSED_KEY, JSON.stringify(dismissedList));
    }
  } catch (error) {
    dbg.error("PromoPostPopup", "Failed to save dismissed state", { error });
  }
}

export default function PromoPostPopup(props) {
  const app = useApp();
  const { t } = app;

  const uiLang = createMemo(() => (app.lang?.() || "en").toLowerCase());
  const [doNotShowAgain, setDoNotShowAgain] = createSignal(false);

  const [postResource] = createResource(
    () => props.promoPostId ? { identifier: props.promoPostId, domain: app.selectedDomainName(), app, lang: uiLang() } : null,
    fetchPostByIdentifier
  );

  const [details] = createResource(postResource, (p) => fetchPostDetails(p, app));
  const [postLang, setPostLang] = createSignal(null);

  // Close popup if post fails to load
  createEffect(() => {
    if (!props.isOpen) return;

    // If post resource has an error
    if (postResource.error) {
      dbg.error("PromoPostPopup", "Error loading post, closing popup", {
        promoPostId: props.promoPostId,
        error: postResource.error
      });
      props.onClose?.();
      return;
    }

    // If post resource finished loading but returned null/undefined (post not found)
    if (!postResource.loading && !postResource()) {
      dbg.error("PromoPostPopup", "Post not found, closing popup", { promoPostId: props.promoPostId });
      props.onClose?.();
      return;
    }

    // If details resource has an error
    if (details.error) {
      dbg.error("PromoPostPopup", "Error loading post details, closing popup", {
        promoPostId: props.promoPostId,
        error: details.error
      });
      props.onClose?.();
      return;
    }

    // If details resource finished loading but has an error in descriptor
    if (!details.loading && details()?.descriptor?.error) {
      dbg.error("PromoPostPopup", "Failed to load post details, closing popup", {
        promoPostId: props.promoPostId,
        error: details().descriptor.error
      });
      props.onClose?.();
      return;
    }
  });

  const availableLocales = createMemo(() => Object.keys(details()?.descriptor?.locales || {}));

  // Auto-select language
  createMemo(() => {
    const locales = availableLocales();
    const want = uiLang();

    if (locales.includes(want)) {
      setPostLang(want);
    } else {
      setPostLang(locales[0] || "en");
    }
  });

  const [mainContent] = createResource(
    () => ({ details: details(), lang: postLang() }),
    ({ details, lang }) => fetchMainContent(details, app, lang)
  );

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

  const handleClose = () => {
    if (doNotShowAgain()) {
      dismissPromo(props.promoPostId);
    }
    props.onClose?.();
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={handleClose}
      size="6xl"
      preventClose={false}
      showClose={true}
      noPadding={true}
      footer={
        <div class="flex items-center justify-between gap-4 py-3">
          <label class="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={doNotShowAgain()}
              onChange={(e) => setDoNotShowAgain(e.target.checked)}
              class="w-4 h-4 rounded border-[hsl(var(--border))] text-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
            <span>{t("promo.doNotShowAgain") || "Do not show again"}</span>
          </label>
          <button
            type="button"
            class="px-6 py-2 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 font-medium"
            onClick={handleClose}
          >
            {t("common.close") || "Close"}
          </button>
        </div>
      }
    >
      <Switch>
        <Match when={postResource.loading}>
          <div class="flex justify-center items-center h-96 p-6">
            <div class="text-center">
              <Spinner class="w-12 h-12 mx-auto mb-4" />
              <p class="text-sm text-muted-foreground">Loading post...</p>
            </div>
          </div>
        </Match>

        <Match when={postResource.error || details()?.descriptor?.error}>
          <div class="p-6">
            <div class="p-6 rounded border text-center border-[hsl(var(--destructive))] bg-[hsl(var(--card))]">
              <h3 class="text-xl font-semibold text-[hsl(var(--destructive))]">{t("common.error")}</h3>
              <p class="text-sm mt-2">{postResource.error?.message || details()?.descriptor?.error}</p>
            </div>
          </div>
        </Match>

        <Match when={!postResource.loading && postResource()}>
          <div class="flex flex-col max-h-[80vh]">
            {/* Fixed header with title and language selector */}
            <header class="flex justify-between items-start gap-6 px-6 pt-6 pb-4 flex-shrink-0">
              <div class="flex-1 min-w-0">
                <h1 class="text-3xl lg:text-4xl font-bold break-words">{title() || t("common.loading")}</h1>
              </div>
              <Show when={availableLocales().length > 1}>
                <LangSelector codes={availableLocales()} value={postLang()} onChange={setPostLang} />
              </Show>
            </header>

            {/* Scrollable content area */}
            <div class="flex-1 overflow-y-auto px-6 pb-6 min-h-0">
              <div class="border-t border-[hsl(var(--border))] pt-6">
                <Switch>
                  <Match when={details.loading || mainContent.loading}>
                    <div class="flex justify-center p-12">
                      <div class="text-center">
                        <Spinner class="w-10 h-10 mx-auto mb-4" />
                        <p class="text-sm text-muted-foreground">Loading content...</p>
                      </div>
                    </div>
                  </Match>
                  <Match when={!details.loading && !mainContent.loading}>
                    <div class="prose prose-lg max-w-none dark:prose-invert">
                      <MarkdownView markdown={localizedMainContent()} rehypePlugins={markdownPlugins()} />
                    </div>
                  </Match>
                </Switch>
              </div>
            </div>
          </div>
        </Match>
      </Switch>
    </Modal>
  );
}

/**
 * Check if we should show the promo post for the given config
 */
export function shouldShowPromoPost(domainConfig) {
  if (!domainConfig?.promo_post) return false;
  return !isPromoDismissed(domainConfig.promo_post);
}
