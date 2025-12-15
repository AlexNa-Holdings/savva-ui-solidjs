// src/x/pages/PostPage.jsx
import { createMemo, createResource, Show, Match, Switch, createEffect, createSignal, onMount, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { useHashRouter, navigate } from "../../routing/smartRouter.js";

import { ipfs } from "../../ipfs/index.js";
import { fetchBestWithDecryption } from "../../ipfs/encryptedFetch.js";
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
import TokenValue from "../ui/TokenValue.jsx";

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
import StoreReadingKeyModal from "../modals/StoreReadingKeyModal.jsx";
import SubscribeModal from "../modals/SubscribeModal.jsx";

// ⬇️ Profile store (same as PostCard)
import useUserProfile, { selectField } from "../profile/userProfileStore.js";

// ⬇️ Encryption imports
import { canDecryptPost, getReadingSecretKey, decryptPostEncryptionKey, decryptPost, isUserInRecipientsList } from "../crypto/postDecryption.js";
import { storeReadingKey } from "../crypto/readingKeyStorage.js";
import { setEncryptedPostContext, clearEncryptedPostContext } from "../../ipfs/encryptedFetch.js";
import { swManager } from "../crypto/serviceWorkerManager.js";
import { loadNsfwPreference } from "../preferences/storage.js";

const getIdentifier = (route) => {
  const path = route().split("?")[0]; // Strip query parameters
  return path.split("/")[2] || "";
};

const getLangFromUrl = (route) => {
  const queryString = route().split("?")[1];
  if (!queryString) return null;
  const params = new URLSearchParams(queryString);
  return params.get("lang");
};

const updateUrlWithLang = (route, lang) => {
  const [path, queryString] = route().split("?");
  const params = new URLSearchParams(queryString || "");

  if (lang) {
    params.set("lang", lang);
  } else {
    params.delete("lang");
  }

  const newQuery = params.toString();
  const newPath = newQuery ? `${path}?${newQuery}` : path;

  navigate(newPath, { replace: true });
};

async function fetchPostByIdentifier(params) {
  const { identifier, domain, app, lang } = params;
  if (!identifier || !domain || !app.wsMethod) return null;

  const contentList = app.wsMethod("content-list");
  const requestParams = { domain, lang, limit: 1, show_nsfw: true, show_all_encrypted_posts: true };

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

async function fetchMainContent(details, app, lang, chapterIndex, postSecretKey = null) {
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
      // Use fetchBestWithDecryption - it will automatically decrypt if context is set
      const { res, decrypted } = await fetchBestWithDecryption(app, contentPath, { postGateways });
      const rawContent = await res.arrayBuffer();

      // Convert to text (already decrypted if needed)
      return new TextDecoder().decode(rawContent);
    } catch (error) {
      return `## ${app.t("post.loadError")}\n\n\`\`\`\n${error.message}\n\`\`\``;
    }
  }

  return "";
}

export default function PostPage() {
  const app = useApp();
  const { t, tLang } = app;
  const { route } = useHashRouter();

  // profile from spec store
  const { dataStable: profile } = useUserProfile();

  const identifier = createMemo(() => getIdentifier(route));
  const uiLang = createMemo(() => (app.lang?.() || "en").toLowerCase());
  const urlLang = createMemo(() => getLangFromUrl(route));

  const [showContributeModal, setShowContributeModal] = createSignal(false);
  const [contributeCampaignId, setContributeCampaignId] = createSignal(null);
  const [showStoreKeyModal, setShowStoreKeyModal] = createSignal(false);
  const [pendingKeyToStore, setPendingKeyToStore] = createSignal(null);
  const [showSubscribeModal, setShowSubscribeModal] = createSignal(false);

  const [postResource, { refetch: refetchPost }] = createResource(
    () => ({ identifier: identifier(), domain: app.selectedDomainName(), app, lang: uiLang() }),
    fetchPostByIdentifier
  );

  const [post, setPost] = createSignal(null);
  createEffect(() => setPost(postResource() || null));

  // Refetch post when authorized user changes (for encryption access check)
  let lastAuthUser = null;
  createEffect(() => {
    const currentAuthUser = app.authorizedUser?.()?.address;
    if (currentAuthUser !== lastAuthUser) {
      if (lastAuthUser !== null) {
        // Not the first run, user changed - refetch the post
        refetchPost();
      }
      lastAuthUser = currentAuthUser;
    }
  });

  // Listen for post updates (reactions, comments, etc.)
  let lastPostUpdate;

  createEffect(() => {
    const update = app.postUpdate?.();
    if (!update || update === lastPostUpdate) return;
    lastPostUpdate = update;

    const currentPost = post();
    if (!currentPost) return;

    const currentCid = currentPost.savva_cid || currentPost.cid || currentPost.id;

    // Author-level updates: apply to all posts by that author
    if (update.type === "authorBanned" || update.type === "authorUnbanned") {
      const myAuthor = (currentPost.author?.address || "").toLowerCase();
      if (myAuthor && myAuthor === (update.author || "").toLowerCase()) {
        setPost(prev => ({
          ...prev,
          author_banned: update.type === "authorBanned"
        }));
      }
      return;
    }

    // Post-level updates: gate by cid/id
    if (update.cid !== currentCid) return;

    if (update.type === "reactionsChanged") {
      setPost(prev => ({
        ...prev,
        reactions: update.data.reactions,
        my_reaction: app.authorizedUser()?.address?.toLowerCase() === update.data?.user?.toLowerCase()
          ? update.data.reaction
          : prev.my_reaction
      }));
    } else if (update.type === "commentCountChanged") {
      setPost(prev => ({
        ...prev,
        total_childs: update.data.newTotal
      }));
    } else if (update.type === "fundChanged" && update.data.fund) {
      setPost(prev => ({
        ...prev,
        fund: { ...prev.fund, ...update.data.fund }
      }));
    } else if (update.type === "postBanned") {
      setPost(prev => ({
        ...prev,
        banned: true
      }));
    } else if (update.type === "postUnbanned") {
      setPost(prev => ({
        ...prev,
        banned: false
      }));
    }
  });

  // Listen for NFT update events to refetch post data
  onMount(() => {
    const handleNftUpdate = (event) => {
      const { contentId, eventType } = event.detail || {};
      const currentPost = post();
      if (!currentPost) return;

      // Get the current post's CID
      const currentCid = currentPost.savva_cid || currentPost.cid || currentPost.id;

      // Only refetch if this event is for our post
      if (contentId && currentCid && String(contentId) === String(currentCid)) {
        dbg.log("PostPage", `Received ${eventType} event for this post, refetching data`);
        refetchPost();
      }
    };

    window.addEventListener("nft-update", handleNftUpdate);
    onCleanup(() => {
      window.removeEventListener("nft-update", handleNftUpdate);
    });
  });

  const [details] = createResource(postResource, (p) => fetchPostDetails(p, app));
  const [postLang, setPostLang] = createSignal(null);
  const [selectedChapterIndex, setSelectedChapterIndex] = createSignal(0);

  // ---- Encryption state ----
  const userAddress = createMemo(() => app.authorizedUser?.()?.address || "");

  const content = createMemo(() => post()?.savva_content || post()?.content);
  const isEncrypted = createMemo(() => !!(content()?.encrypted && !post()?._decrypted));
  const encryptionData = createMemo(() => content()?.encryption);

  const canDecrypt = createMemo(() => {
    if (!isEncrypted()) return false;
    const encData = encryptionData();
    if (!encData || !encData.reading_key_nonce) return false;
    return canDecryptPost(userAddress(), encData);
  });

  const isUserInRecipients = createMemo(() => {
    if (!isEncrypted()) return false;
    const encData = encryptionData();
    if (!encData) return false;
    return isUserInRecipientsList(userAddress(), encData);
  });

  // Get recipient list information from descriptor
  const recipientListType = createMemo(() => details()?.descriptor?.recipient_list_type || "public");
  const recipientListMinWeekly = createMemo(() => {
    const minWeekly = details()?.descriptor?.recipient_list_min_weekly;
    return minWeekly ? BigInt(minWeekly) : 0n;
  });

  const [postSecretKey, setPostSecretKey] = createSignal(null);
  const [isDecrypting, setIsDecrypting] = createSignal(false);
  const [decryptError, setDecryptError] = createSignal(null);

  // Set/clear encrypted post context for automatic IPFS decryption
  createEffect(() => {
    const key = postSecretKey();
    const dataCid = details()?.dataCidForContent;

    if (key && dataCid) {
      // Set context for both blob-based decryption (fallback) and Service Worker
      setEncryptedPostContext({ dataCid, postSecretKey: key });

      // Also set context in Service Worker for streaming decryption
      swManager.setEncryptionContext(dataCid, key).catch(err => {
        console.warn('[PostPage] Failed to set SW encryption context:', err);
        // Fallback to blob-based decryption will still work
      });
    } else {
      clearEncryptedPostContext();
      swManager.clearAllContexts().catch(console.error);
    }
  });

  // Clear context on unmount
  onCleanup(() => {
    clearEncryptedPostContext();
    swManager.clearAllContexts().catch(console.error);
  });

  // Auto-decrypt metadata if we have the key stored
  createEffect(async () => {
    if (!isEncrypted() || post()?._decrypted) return;
    if (!canDecrypt()) return;

    const encData = encryptionData();
    if (!encData) return;

    try {
      setIsDecrypting(true);
      const userAddr = userAddress();

      // Decrypt the post (metadata)
      const decrypted = await decryptPost(post(), userAddr);
      setPost(decrypted);

      // Get the post secret key for content decryption
      const readingKey = await getReadingSecretKey(userAddr, encData.reading_key_nonce);
      const postKey = decryptPostEncryptionKey(encData, readingKey);
      setPostSecretKey(postKey);

      dbg.log("PostPage", "Auto-decrypted post", { hasPostKey: !!postKey });
    } catch (error) {
      dbg.error("PostPage", "Auto-decrypt failed", { error });
      setDecryptError(error.message);
    } finally {
      setIsDecrypting(false);
    }
  });

  // Manual decryption handler
  const handleDecrypt = async (e) => {
    e?.preventDefault();
    e?.stopPropagation();

    const encData = encryptionData();
    if (!encData) return;

    try {
      setIsDecrypting(true);
      setDecryptError(null);
      const userAddr = userAddress();

      // Get reading secret key (will prompt for signature)
      const readingKey = await getReadingSecretKey(userAddr, encData.reading_key_nonce);
      if (!readingKey) {
        throw new Error("Failed to get reading key");
      }

      // Decrypt the post
      const decrypted = await decryptPost(post(), userAddr, readingKey);
      setPost(decrypted);

      // Get post secret key for content decryption
      const postKey = decryptPostEncryptionKey(encData, readingKey);
      setPostSecretKey(postKey);

      dbg.log("PostPage", "Manual decrypt successful");

      // Prompt user to store the secret key
      setPendingKeyToStore({
        nonce: encData.reading_key_nonce,
        publicKey: encData.reading_public_key,
        secretKey: readingKey,
        address: userAddr,
      });
      setShowStoreKeyModal(true);
    } catch (error) {
      dbg.error("PostPage", "Manual decrypt failed", { error });
      setDecryptError(error.message);
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleConfirmStoreKey = () => {
    const pending = pendingKeyToStore();
    if (pending) {
      storeReadingKey(pending.address, {
        nonce: pending.nonce,
        publicKey: pending.publicKey,
        secretKey: pending.secretKey,
      });
    }

    setShowStoreKeyModal(false);
    setPendingKeyToStore(null);
  };

  const handleDeclineStoreKey = () => {
    setShowStoreKeyModal(false);
    setPendingKeyToStore(null);
  };

  const shouldCoverEncrypted = createMemo(() => {
    return isEncrypted() && !post()?._decrypted && !isDecrypting();
  });

  const [mainContent] = createResource(
    () => ({ details: details(), lang: postLang(), chapterIndex: selectedChapterIndex(), postSecretKey: postSecretKey() }),
    ({ details, lang, chapterIndex, postSecretKey }) => fetchMainContent(details, app, lang, chapterIndex, postSecretKey)
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
    const langFromUrl = urlLang();
    const want = langFromUrl || uiLang();

    // Prioritize URL lang param if available and valid, otherwise use UI lang
    if (langFromUrl && locales.includes(langFromUrl)) {
      setPostLang(langFromUrl);
    } else if (locales.includes(want)) {
      setPostLang(want);
    } else {
      setPostLang(locales[0] || "en");
    }
  });

  // Handler for language change from selector
  const handleLangChange = (newLang) => {
    setPostLang(newLang);
    // Only update URL with lang param if post has multiple languages
    const locales = availableLocales();
    if (locales.length > 1) {
      updateUrlWithLang(route, newLang);
    }
  };

  const actorAddress = createMemo(() => app.actorAddress?.() || app.authorizedUser?.()?.address || "");

  const title = createMemo(() => {
    // Use decrypted content from post() if available, otherwise fall back to descriptor
    const p = post();
    const contentLocales = p?.savva_content?.locales || p?.content?.locales;
    const loc = contentLocales?.[postLang()] || details()?.descriptor?.locales?.[postLang()];
    return (loc?.title || "").trim();
  });

  const chapters = createMemo(() => {
    // Use decrypted content from post() if available, otherwise fall back to descriptor
    const p = post();
    const contentLocales = p?.savva_content?.locales || p?.content?.locales;
    const fromContent = contentLocales?.[postLang()]?.chapters;
    const fromDescriptor = details()?.descriptor?.locales?.[postLang()]?.chapters;
    // Prefer content chapters if they exist, otherwise use descriptor chapters
    return fromContent || fromDescriptor || [];
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
  const nsfwMode = createMemo(() => loadNsfwPreference());
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

                    <LangSelector codes={availableLocales()} value={postLang()} onChange={handleLangChange} />
                  </div>
                </header>

                <div class="pt-4 border-t border-[hsl(var(--border))]">
                  <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_12rem] gap-6 items-start">
                    {/* Left column with optional warning cover */}
                    <div class="relative min-h-[12rem]">
                      {/* NSFW Warning Overlay */}
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

                      {/* Encrypted Content Overlay */}
                      <Show when={shouldCoverEncrypted()}>
                        <div class="absolute inset-0 z-20 flex items-center justify-center rounded-md">
                          <div class="absolute inset-0 rounded-md bg-[hsl(var(--card))]/90 backdrop-blur-md" />
                          <div class="relative z-10 flex flex-col items-center gap-4 text-center px-6 max-w-md">
                            <svg class="w-16 h-16 text-[hsl(var(--muted-foreground))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <div class="space-y-2">
                              <div class="text-lg font-semibold">{t("post.encrypted.title") || "Encrypted Content"}</div>
                              <p class="text-sm text-[hsl(var(--muted-foreground))]">
                                {t("post.encrypted.description") || "This post is encrypted for subscribers only"}
                              </p>
                            </div>
                            <Show when={userAddress() && isUserInRecipients()}>
                              <button
                                onClick={handleDecrypt}
                                disabled={isDecrypting()}
                                class="px-6 py-3 rounded-md font-medium bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                              >
                                {isDecrypting() ? t("post.encrypted.decrypting") || "Decrypting..." : t("post.encrypted.unlock") || "Unlock Content"}
                              </button>
                            </Show>
                            <Show when={userAddress() && !isUserInRecipients()}>
                              {/* Show subscription requirements if this is a subscribers-only post */}
                              <Show when={recipientListType() === "subscribers"}>
                                <div class="p-4 rounded-md bg-[hsl(var(--muted))] border border-[hsl(var(--border))] text-center">
                                  <div class="text-sm font-medium mb-2">
                                    {t("post.encrypted.subscribeForFuture") || "Subscribe to access future posts like this"}
                                  </div>
                                  <Show when={recipientListMinWeekly() > 0n}>
                                    <div class="text-xs text-[hsl(var(--muted-foreground))] mb-3">
                                      {t("post.encrypted.minimumWeekly") || "Minimum weekly subscription"}:
                                      <div class="mt-1 flex justify-center">
                                        <TokenValue
                                          amount={recipientListMinWeekly()}
                                          tokenAddress={app.info()?.savva_contracts?.Staking?.address || ""}
                                          format="inline"
                                        />
                                      </div>
                                    </div>
                                  </Show>
                                  <button
                                    onClick={() => setShowSubscribeModal(true)}
                                    class="px-4 py-2 rounded-md text-sm font-medium bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity"
                                  >
                                    {t("post.encrypted.subscribeButton") || "Subscribe Now"}
                                  </button>
                                </div>
                              </Show>

                              {/* Fallback message for non-subscriber encrypted posts */}
                              <Show when={recipientListType() !== "subscribers"}>
                                <p class="text-sm text-[hsl(var(--muted-foreground))]">
                                  {t("post.encrypted.noAccess") || "You don't have access to this content"}
                                </p>
                              </Show>
                            </Show>
                            <Show when={!userAddress()}>
                              <p class="text-sm text-[hsl(var(--muted-foreground))]">
                                {t("post.encrypted.loginRequired") || "Please connect your wallet to unlock"}
                              </p>
                            </Show>
                            <Show when={decryptError()}>
                              <p class="text-sm text-[hsl(var(--destructive))]">{decryptError()}</p>
                            </Show>
                          </div>
                        </div>
                      </Show>

                      <div class={(shouldWarn() && !revealed()) || shouldCoverEncrypted() ? "select-none pointer-events-none blur-sm" : ""}>
                        <Switch>
                          <Match when={details.loading || mainContent.loading}>
                            <div class="flex justify-center p-8"><Spinner /></div>
                          </Match>
                          <Match when={!details.loading && !mainContent.loading}>
                            <Show when={chapters().length > 0}>
                              <div class="flex justify-end mb-4">
                                <ChapterSelector
                                  chapters={[
                                    { title: tLang(postLang(), "post.chapters.prologue") },
                                    ...(chapters().map((ch, i) => ({
                                      title: ch.title || `${tLang(postLang(), "post.chapters.chapter")} ${i + 1}`
                                    })))
                                  ]}
                                  selectedIndex={selectedChapterIndex()}
                                  onSelect={setSelectedChapterIndex}
                                />
                              </div>
                            </Show>

                            <MarkdownView markdown={localizedMainContent()} rehypePlugins={markdownPlugins()} />

                            <Show when={chapters().length > 0}>
                              <ChapterPager
                                chapters={[
                                  { title: tLang(postLang(), "post.chapters.prologue") },
                                  ...(chapters().map((ch, i) => ({
                                    title: ch.title || `${tLang(postLang(), "post.chapters.chapter")} ${i + 1}`
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
                    <PostRightPanel post={post()} details={details} onOpenContributeModal={openContributeModal} currentLang={postLang()} />
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

      <StoreReadingKeyModal
        isOpen={showStoreKeyModal()}
        onClose={handleDeclineStoreKey}
        onConfirm={handleConfirmStoreKey}
      />

      <SubscribeModal
        isOpen={showSubscribeModal()}
        domain={app.selectedDomainName()}
        author={post()?.author || post()?.user}
        initialWeeklyAmountWei={recipientListMinWeekly()}
        onClose={() => setShowSubscribeModal(false)}
        onSubmit={() => {
          setShowSubscribeModal(false);
          // Optionally refetch post to update subscription status
          refetchPost();
        }}
      />
    </main>
  );
}
