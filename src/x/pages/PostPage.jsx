// src/x/pages/PostPage.jsx
import { createMemo, createResource, Show, Match, Switch, createEffect, createSignal, onMount, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { useApp } from "../../context/AppContext.jsx";
import { formatUnits } from "viem";
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
import { canDecryptPost, getReadingSecretKey, decryptPostEncryptionKey, decryptPost, isUserInRecipientsList, getUserEncryptionData } from "../crypto/postDecryption.js";
import { storeReadingKey } from "../crypto/readingKeyStorage.js";
import { setEncryptedPostContext, clearEncryptedPostContext } from "../../ipfs/encryptedFetch.js";
import { swManager } from "../crypto/serviceWorkerManager.js";
import { loadNsfwPreference } from "../preferences/storage.js";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { sendAsActor } from "../../blockchain/npoMulticall.js";
import { connectWallet } from "../../blockchain/wallet.js";
import { pushToast } from "../../ui/toast.js";
import { toHex, stringToBytes } from "viem";
import { fetchReadingKey, generateReadingKey, publishReadingKey } from "../crypto/readingKey.js";

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

  console.log("[PostPage] fetchPostByIdentifier request:", {
    savva_cid: requestParams.savva_cid,
    short_cid: requestParams.short_cid,
    my_addr: requestParams.my_addr,
    domain: requestParams.domain,
    fullParams: requestParams,
  });

  const res = await contentList(requestParams);
  const arr = Array.isArray(res) ? res : Array.isArray(res?.list) ? res.list : [];
  const post = arr[0] || null;

  // Debug: log encryption data from server response
  if (post) {
    const encData = post.savva_content?.encryption;
    const userAddr = user?.address?.toLowerCase();
    console.log("[PostPage] fetchPostByIdentifier response - encryption data:", {
      postId: post.savva_cid || post.short_cid,
      isEncrypted: !!post.savva_content?.encrypted,
      hasEncryptionData: !!encData,
      // Root level
      hasReadingKeyNonceAtRoot: !!encData?.reading_key_nonce,
      hasReadingPublicKeyAtRoot: !!encData?.reading_public_key,
      hasPassAtRoot: !!encData?.pass,
      readingPublicKeyAtRoot: encData?.reading_public_key,
      readingKeyNonceAtRoot: encData?.reading_key_nonce,
      // Recipients
      recipientCount: encData?.recipients ? Object.keys(encData.recipients).length : 0,
      recipientKeys: encData?.recipients ? Object.keys(encData.recipients) : [],
      userInRecipients: userAddr && encData?.recipients ? userAddr in encData.recipients : false,
      // Full encryption object for inspection
      encryptionData: encData,
    });
  }

  return post;
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
  const [showPurchaseDialog, setShowPurchaseDialog] = createSignal(false);
  const [isPurchasing, setIsPurchasing] = createSignal(false);

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
  // Note: isEncryptedPost checks if the post WAS encrypted (regardless of decryption state)
  // This is used for content fetching logic
  const isEncryptedPost = createMemo(() => !!content()?.encrypted);
  // isEncrypted checks if we still need to show the "locked" overlay
  const isEncrypted = createMemo(() => !!(content()?.encrypted && !post()?._decrypted));
  const encryptionData = createMemo(() => content()?.encryption);

  const canDecrypt = createMemo(() => {
    if (!isEncrypted()) return false;
    const encData = encryptionData();
    if (!encData) return false;
    // Check if we have user-specific encryption data (at root or in recipients)
    const userEncData = getUserEncryptionData(userAddress(), encData);
    if (!userEncData) return false;
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

  // Purchase access info
  const purchaseInfo = createMemo(() => {
    const encData = encryptionData();
    if (!encData?.allow_purchase) return null;
    const priceWei = encData.purchase_price;
    if (!priceWei) return null;
    try {
      const priceFormatted = formatUnits(BigInt(priceWei), 18);
      return {
        available: true,
        priceWei,
        priceFormatted,
        processorAddress: encData.processor_address,
        purchaseToken: encData.purchase_token,
      };
    } catch {
      return null;
    }
  });

  // Fetch purchase fee from SavvaPurchase contract
  const [purchaseFee] = createResource(
    () => purchaseInfo()?.available ? app.desiredChain()?.id : null,
    async () => {
      try {
        const purchaseContract = await getSavvaContract(app, "SavvaPurchase");
        const feeBps = await purchaseContract.read.feeBps();
        return Number(feeBps); // basis points (e.g., 500 = 5%)
      } catch (e) {
        dbg.warn("PostPage", "Failed to fetch purchase fee", e);
        return null;
      }
    }
  );

  // Calculate fee amount in wei
  const purchaseFeeAmount = createMemo(() => {
    const info = purchaseInfo();
    const feeBps = purchaseFee();
    if (!info || !feeBps) return null;
    try {
      const priceWei = BigInt(info.priceWei);
      return (priceWei * BigInt(feeBps)) / 10000n;
    } catch {
      return null;
    }
  });

  // Fetch user's SAVVA balance when purchase dialog is shown
  const [userBalance, { refetch: refetchBalance }] = createResource(
    () => showPurchaseDialog() ? (app.actorAddress?.() || app.authorizedUser?.()?.address) : null,
    async (actorAddr) => {
      if (!actorAddr) return null;
      try {
        const savvaToken = await getSavvaContract(app, "SavvaToken");
        const balance = await savvaToken.read.balanceOf([actorAddr]);
        return balance;
      } catch (e) {
        dbg.warn("PostPage", "Failed to fetch SAVVA balance", e);
        return null;
      }
    }
  );

  // Check if user has enough balance for purchase
  const hasEnoughBalance = createMemo(() => {
    const balance = userBalance();
    const info = purchaseInfo();
    if (balance === null || balance === undefined || !info) return null;
    try {
      return BigInt(balance) >= BigInt(info.priceWei);
    } catch {
      return null;
    }
  });

  const [postSecretKey, setPostSecretKey] = createSignal(null);
  const [isDecrypting, setIsDecrypting] = createSignal(false);
  const [decryptError, setDecryptError] = createSignal(null);

  // Track if encryption context has been set (for timing synchronization)
  const [encryptionContextReady, setEncryptionContextReady] = createSignal(false);

  // Handle encryption context updates and Service Worker sync
  // Note: Initial context is set synchronously in decrypt handlers to avoid race conditions
  createEffect(() => {
    const key = postSecretKey();
    const dataCid = details()?.dataCidForContent;

    if (key && dataCid) {
      // Ensure context is set (may already be set by decrypt handlers)
      if (!encryptionContextReady()) {
        setEncryptedPostContext({ dataCid, postSecretKey: key });
        setEncryptionContextReady(true);
        dbg.log("PostPage", "Encryption context set via effect", { dataCid, hasKey: !!key });
      }

      // Also set context in Service Worker for streaming decryption (async, can fail)
      swManager.setEncryptionContext(dataCid, key).catch(err => {
        console.warn('[PostPage] Failed to set SW encryption context:', err);
        // Fallback to blob-based decryption will still work
      });
    } else {
      // Clear context when key or dataCid is removed
      clearEncryptedPostContext();
      setEncryptionContextReady(false);
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

      // Get user-specific encryption data (might be at root or in recipients object)
      const userEncData = getUserEncryptionData(userAddr, encData);
      if (!userEncData) {
        dbg.log("PostPage", "Auto-decrypt: no user-specific encryption data found");
        return;
      }

      // Get the reading key from storage (pass publicKey for cross-post key lookup)
      dbg.log("PostPage", "Auto-decrypt: getting reading key from storage...");
      const readingKey = await getReadingSecretKey(
        userAddr,
        userEncData.reading_key_nonce,
        false, // forceRecover
        userEncData.reading_public_key // publicKey for lookup
      );
      if (!readingKey) {
        dbg.log("PostPage", "Auto-decrypt: no stored reading key, skipping auto-decrypt");
        return; // No stored key, user will need to manually decrypt
      }
      dbg.log("PostPage", "Auto-decrypt: got reading key from storage");

      // Get the post secret key for content decryption
      dbg.log("PostPage", "Auto-decrypt: decrypting post encryption key...");
      const postKey = await decryptPostEncryptionKey(userEncData, readingKey);
      if (!postKey) {
        throw new Error("Failed to decrypt post encryption key");
      }
      dbg.log("PostPage", "Auto-decrypt: got postKey", { hasPostKey: !!postKey });

      // Decrypt the post (metadata) to verify it works
      dbg.log("PostPage", "Auto-decrypt: decrypting post metadata...");
      const decrypted = await decryptPost(post(), userAddr);
      if (!decrypted?._decrypted) {
        throw new Error("Failed to decrypt post metadata");
      }
      dbg.log("PostPage", "Auto-decrypt: decrypted post metadata", { _decrypted: decrypted?._decrypted });

      // Set encryption context BEFORE updating signals to avoid race conditions
      const dataCid = details()?.dataCidForContent;
      if (dataCid && postKey) {
        setEncryptedPostContext({ dataCid, postSecretKey: postKey });
        setEncryptionContextReady(true);
        dbg.log("PostPage", "Auto-decrypt: set encryption context", { dataCid, hasKey: true });
      }

      // Now set state after context is ready
      setPostSecretKey(postKey);
      setPost(decrypted);

      dbg.log("PostPage", "Auto-decrypted post", { hasPostKey: !!postKey, _decrypted: !!decrypted?._decrypted });
    } catch (error) {
      dbg.error("PostPage", "Auto-decrypt failed", { error });
      setDecryptError(error.message);
      // Show error as toast for auto-decrypt failures too
      app.pushToast?.({ type: "error", message: t("post.encrypted.decryptFailed") || `Auto-decryption failed: ${error.message}` });
      // Clear any partially set state
      setPostSecretKey(null);
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

      // Get user-specific encryption data (might be at root or in recipients object)
      const userEncData = getUserEncryptionData(userAddr, encData);
      if (!userEncData) {
        throw new Error("User not in recipients list");
      }

      // Get reading key with full key data (will prompt for signature)
      // Use returnFullKey=true to get the publicKey from the recovery process
      // since userEncData.reading_public_key may not be provided by the API
      dbg.log("PostPage", "Manual decrypt: getting reading key...");
      const readingKeyData = await getReadingSecretKey(
        userAddr,
        userEncData.reading_key_nonce,
        false, // forceRecover
        userEncData.reading_public_key, // publicKey hint (may be null)
        true // returnFullKey - get { secretKey, publicKey, nonce }
      );
      if (!readingKeyData || !readingKeyData.secretKey) {
        throw new Error("Failed to get reading key");
      }
      dbg.log("PostPage", "Manual decrypt: got reading key", {
        hasSecretKey: !!readingKeyData.secretKey,
        hasPublicKey: !!readingKeyData.publicKey,
      });

      // Get post secret key for content decryption
      dbg.log("PostPage", "Manual decrypt: decrypting post encryption key...");
      const postKey = await decryptPostEncryptionKey(userEncData, readingKeyData.secretKey);
      if (!postKey) {
        throw new Error("Failed to decrypt post encryption key");
      }
      dbg.log("PostPage", "Manual decrypt: got postKey", { hasPostKey: !!postKey });

      // Decrypt the post metadata FIRST to verify it works
      dbg.log("PostPage", "Manual decrypt: decrypting post metadata...");
      const decrypted = await decryptPost(post(), userAddr, readingKeyData.secretKey);
      if (!decrypted?._decrypted) {
        throw new Error("Failed to decrypt post metadata");
      }
      dbg.log("PostPage", "Manual decrypt: decrypted post metadata", { _decrypted: decrypted?._decrypted });

      // Set encryption context BEFORE updating signals to avoid race conditions
      const dataCid = details()?.dataCidForContent;
      if (dataCid && postKey) {
        setEncryptedPostContext({ dataCid, postSecretKey: postKey });
        setEncryptionContextReady(true);
        dbg.log("PostPage", "Manual decrypt: set encryption context", { dataCid, hasKey: true });
      }

      // Now set state after context is ready
      setPostSecretKey(postKey);
      setPost(decrypted);

      dbg.log("PostPage", "Manual decrypt successful", { postSecretKey: !!postKey, _decrypted: !!decrypted?._decrypted });

      // Log key data for debugging
      console.log("[PostPage] Key data for storage:", {
        nonce: readingKeyData.nonce,
        publicKey: readingKeyData.publicKey,
        hasSecretKey: !!readingKeyData.secretKey,
        encDataPublicKey: encData.reading_public_key,
      });

      // Prompt user to store the secret key
      // Use publicKey from readingKeyData (derived from recovery) rather than encData
      // since encData.reading_public_key may not be provided by the API
      setPendingKeyToStore({
        nonce: readingKeyData.nonce,
        publicKey: readingKeyData.publicKey,
        secretKey: readingKeyData.secretKey,
        address: userAddr,
      });
      setShowStoreKeyModal(true);
    } catch (error) {
      dbg.error("PostPage", "Manual decrypt failed", { error });
      setDecryptError(error.message);
      // Show error as toast
      app.pushToast?.({ type: "error", message: t("post.encrypted.decryptFailed") || `Decryption failed: ${error.message}` });
      // Clear any partially set state
      setPostSecretKey(null);
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleConfirmStoreKey = () => {
    const pending = pendingKeyToStore();
    if (pending) {
      console.log("[PostPage] Storing reading key:", {
        address: pending.address,
        nonce: pending.nonce,
        publicKey: pending.publicKey,
        hasSecretKey: !!pending.secretKey,
      });

      const success = storeReadingKey(pending.address, {
        nonce: pending.nonce,
        publicKey: pending.publicKey,
        secretKey: pending.secretKey,
      });

      console.log("[PostPage] storeReadingKey result:", success);

      if (success) {
        app.pushToast?.({ type: "success", message: "Reading key stored in browser" });
      } else {
        app.pushToast?.({ type: "error", message: "Failed to store reading key" });
      }
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

  // For encrypted posts, wait until we have the decryption key AND context is set before fetching content
  const readyToFetchContent = createMemo(() => {
    const d = details();
    if (!d) return false;
    // If post was encrypted, we need the key AND the encryption context to be ready
    if (isEncryptedPost()) {
      if (!postSecretKey()) {
        dbg.log("PostPage", "readyToFetchContent: waiting for postSecretKey", { isEncryptedPost: isEncryptedPost(), hasKey: false });
        return false;
      }
      if (!encryptionContextReady()) {
        dbg.log("PostPage", "readyToFetchContent: waiting for encryption context", { isEncryptedPost: isEncryptedPost(), hasKey: true, contextReady: false });
        return false;
      }
    }
    dbg.log("PostPage", "readyToFetchContent: ready", { isEncryptedPost: isEncryptedPost(), hasKey: !!postSecretKey(), contextReady: encryptionContextReady() });
    return true;
  });

  const [mainContent] = createResource(
    () => {
      if (!readyToFetchContent()) return null;
      return { details: details(), lang: postLang(), chapterIndex: selectedChapterIndex(), postSecretKey: postSecretKey() };
    },
    (params) => params ? fetchMainContent(params.details, app, params.lang, params.chapterIndex, params.postSecretKey) : ""
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

  // Listen for purchase access granted event
  onMount(() => {
    const handlePurchaseAccessGranted = (event) => {
      const { savva_cid } = event.detail || {};
      const currentPost = post();
      if (!currentPost) return;

      const currentCid = currentPost.savva_cid || currentPost.cid || currentPost.id;
      if (savva_cid && currentCid && String(savva_cid) === String(currentCid)) {
        dbg.log("PostPage", "Received purchase access granted for this post, refetching...");
        refetchPost();
      }
    };

    window.addEventListener("savva:purchase-access-granted", handlePurchaseAccessGranted);
    onCleanup(() => {
      window.removeEventListener("savva:purchase-access-granted", handlePurchaseAccessGranted);
    });
  });

  // Purchase handler
  const handlePurchase = async () => {
    const info = purchaseInfo();
    if (!info) return;

    const authorAddress = post()?.author?.address;
    const savvaCid = post()?.savva_cid || post()?.short_cid;
    if (!authorAddress || !savvaCid) {
      pushToast({ type: "error", message: t("post.purchase.errorMissingData") || "Missing post data" });
      return;
    }

    setIsPurchasing(true);
    try {
      const actorAddr = app.actorAddress?.() || app.authorizedUser?.()?.address;

      if (!actorAddr) {
        throw new Error(t("post.purchase.errorNotConnected") || "Wallet not connected");
      }

      // Step 1: Check if user has a published reading key
      pushToast({ type: "info", message: t("post.purchase.checkingReadingKey") || "Checking reading key...", autohideMs: 0, id: "purchase_check" });

      const existingKey = await fetchReadingKey(app, actorAddr);
      app.dismissToast?.("purchase_check");

      if (!existingKey) {
        // User needs to generate and publish a reading key first
        pushToast({ type: "info", message: t("post.purchase.generatingReadingKey") || "Generating reading key...", autohideMs: 0, id: "purchase_keygen" });

        try {
          // Generate the reading key (will prompt for wallet signature)
          const { nonce, publicKey, secretKey } = await generateReadingKey(actorAddr);

          // Publish to contract
          await publishReadingKey(app, publicKey, nonce);

          // Store locally for future decryption
          storeReadingKey(actorAddr, { nonce, publicKey, secretKey });

          app.dismissToast?.("purchase_keygen");
          pushToast({ type: "success", message: t("post.purchase.readingKeyPublished") || "Reading key published!", autohideMs: 3000 });
        } catch (keyError) {
          app.dismissToast?.("purchase_keygen");
          throw new Error(t("post.purchase.errorReadingKey") || "Failed to publish reading key. Please try again.");
        }
      }

      // Step 2: Check balance and allowance
      const purchaseContract = await getSavvaContract(app, "SavvaPurchase");
      const savvaToken = await getSavvaContract(app, "SavvaToken");
      const priceWei = BigInt(info.priceWei);

      // Check balance first
      const balance = await savvaToken.read.balanceOf([actorAddr]);
      console.log("[PostPage] Purchase - balance check:", {
        balance: balance.toString(),
        priceWei: priceWei.toString(),
        hasEnough: balance >= priceWei,
      });

      if (balance < priceWei) {
        throw new Error(t("post.purchase.insufficientBalance") || `Insufficient balance. You have ${formatUnits(balance, 18)} SAVVA but need ${formatUnits(priceWei, 18)} SAVVA.`);
      }

      const allowance = await savvaToken.read.allowance([actorAddr, purchaseContract.address]);
      console.log("[PostPage] Purchase - allowance check:", {
        allowance: allowance.toString(),
        priceWei: priceWei.toString(),
        needsApproval: allowance < priceWei,
      });

      if (allowance < priceWei) {
        pushToast({ type: "info", message: t("post.purchase.approving") || "Approving SAVVA token...", autohideMs: 0, id: "purchase_approve" });

        const MAX_UINT = (1n << 256n) - 1n;
        await sendAsActor(app, {
          contractName: "SavvaToken",
          functionName: "approve",
          args: [purchaseContract.address, MAX_UINT],
        });

        app.dismissToast?.("purchase_approve");
      }

      // Step 3: Build metadata and call buy
      const metadata = {
        sku: "access_to_post",
        savva_cid: savvaCid,
        processor_address: info.processorAddress,
      };
      const metadataBytes = toHex(stringToBytes(JSON.stringify(metadata)));

      pushToast({ type: "info", message: t("post.purchase.processing") || "Processing purchase...", autohideMs: 0, id: "purchase_tx" });

      // Call buy function
      await sendAsActor(app, {
        contractName: "SavvaPurchase",
        functionName: "buy",
        args: [info.purchaseToken, priceWei, authorAddress, metadataBytes],
      });

      app.dismissToast?.("purchase_tx");
      setShowPurchaseDialog(false);

      // Show pending message - the actual access will be granted via WebSocket alert
      pushToast({
        type: "info",
        message: t("post.purchase.pending") || "Purchase submitted! Waiting for confirmation...",
        autohideMs: 10000,
      });

    } catch (error) {
      dbg.error("PostPage", "Purchase failed", error);
      app.dismissToast?.("purchase_check");
      app.dismissToast?.("purchase_keygen");
      app.dismissToast?.("purchase_approve");
      app.dismissToast?.("purchase_tx");
      pushToast({
        type: "error",
        message: t("post.purchase.errorFailed") || `Purchase failed: ${error.message}`,
        autohideMs: 8000,
      });
    } finally {
      setIsPurchasing(false);
    }
  };

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
                              {/* Purchase access option */}
                              <Show when={purchaseInfo()}>
                                <div class="p-4 rounded-md bg-[hsl(var(--muted))] border border-[hsl(var(--border))] text-center w-full max-w-xs mx-auto">
                                  <div class="text-sm font-medium mb-2">
                                    {t("post.encrypted.buyAccessTitle") || "Buy access to this post"}
                                  </div>
                                  <button
                                    onClick={() => setShowPurchaseDialog(true)}
                                    class="px-4 py-2 rounded-md text-sm font-medium bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity flex items-center gap-2 mx-auto"
                                  >
                                    <span>{t("post.encrypted.buyAccess") || "Buy access"} —</span>
                                    <TokenValue
                                      amount={purchaseInfo().priceWei}
                                      tokenAddress={purchaseInfo().purchaseToken}
                                      format="inline"
                                    />
                                  </button>
                                  <div class="text-xs text-[hsl(var(--muted-foreground))] mt-2 italic">
                                    {t("post.encrypted.buyAccessHint") || "One-time payment for permanent access"}
                                  </div>
                                </div>
                              </Show>

                              {/* Show subscription requirements if this is a subscribers-only post */}
                              <Show when={recipientListType() === "subscribers"}>
                                <div class="p-4 rounded-md bg-[hsl(var(--muted))] border border-[hsl(var(--border))] text-center w-full max-w-xs mx-auto">
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
                              <Show when={purchaseInfo()}>
                                <div class="p-4 rounded-md bg-[hsl(var(--muted))] border border-[hsl(var(--border))] text-center w-full max-w-xs mx-auto">
                                  <div class="text-sm font-medium mb-2">
                                    {t("post.encrypted.buyAccessTitle") || "Buy access to this post"}
                                  </div>
                                  <div class="text-xs text-[hsl(var(--muted-foreground))] mb-3 flex justify-center">
                                    <TokenValue
                                      amount={purchaseInfo().priceWei}
                                      tokenAddress={purchaseInfo().purchaseToken}
                                      format="inline"
                                    />
                                  </div>
                                  <button
                                    onClick={async () => await connectWallet()}
                                    class="px-4 py-2 rounded-md text-sm font-medium bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity"
                                  >
                                    {t("wallet.connect") || "Connect wallet"}
                                  </button>
                                </div>
                              </Show>
                              <Show when={!purchaseInfo()}>
                                <p class="text-sm text-[hsl(var(--muted-foreground))]">
                                  {t("post.encrypted.loginRequired") || "Please connect your wallet to unlock"}
                                </p>
                              </Show>
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

      {/* Purchase Access Dialog */}
      <Show when={showPurchaseDialog()}>
        <Portal>
          <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setShowPurchaseDialog(false)}
          >
            <div
              class="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl shadow-2xl p-6 max-w-md w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-[hsl(var(--foreground))] flex items-center gap-2">
                  <svg class="w-6 h-6 text-[hsl(var(--primary))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t("post.purchase.title") || "Purchase Access"}
                </h3>
                <button
                  class="p-1 rounded-md hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                  onClick={() => setShowPurchaseDialog(false)}
                >
                  <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Post title */}
              <div class="mb-3 text-sm font-medium text-[hsl(var(--foreground))] line-clamp-2">
                <span class="text-[hsl(var(--muted-foreground))]">{t("post.purchase.postLabel") || "Post:"}</span> {title() || t("post.untitled") || "Untitled Post"}
              </div>

              {/* Author info with UserCard */}
              <div class="mb-4 p-3 rounded-lg bg-[hsl(var(--muted))]">
                <UserCard author={post()?.author} />
              </div>

              {/* Price display with USD */}
              <div class="mb-4 p-5 rounded-xl border-2 border-[hsl(var(--primary)/0.3)] bg-gradient-to-b from-[hsl(var(--primary)/0.1)] to-[hsl(var(--primary)/0.05)]">
                <div class="text-center">
                  <TokenValue
                    amount={purchaseInfo()?.priceWei || "0"}
                    tokenAddress={purchaseInfo()?.purchaseToken}
                    format="vertical"
                    centered
                    class="text-3xl font-bold text-[hsl(var(--foreground))]"
                  />
                  <div class="mt-3 text-xs text-[hsl(var(--primary))] font-medium">
                    {t("post.purchase.supportAuthor") || "Support the author and see the content now!"}
                  </div>
                </div>
              </div>

              {/* User balance display */}
              <div class={`mb-4 p-3 rounded-lg ${hasEnoughBalance() === false ? 'bg-red-500/10 border border-red-500/30' : 'bg-[hsl(var(--muted))]'}`}>
                <div class="flex items-center justify-between text-sm">
                  <span class="text-[hsl(var(--muted-foreground))]">{t("post.purchase.yourBalance") || "Your balance:"}</span>
                  <Show when={userBalance() !== null && userBalance() !== undefined} fallback={<span class="text-[hsl(var(--muted-foreground))]">Loading...</span>}>
                    <TokenValue
                      amount={userBalance()?.toString() || "0"}
                      tokenAddress={purchaseInfo()?.purchaseToken}
                      format="inline"
                      class={hasEnoughBalance() === false ? 'text-red-500 font-medium' : 'text-[hsl(var(--foreground))] font-medium'}
                    />
                  </Show>
                </div>
                <Show when={hasEnoughBalance() === false}>
                  <div class="mt-2 text-xs text-red-500 text-center font-medium">
                    {t("post.purchase.insufficientBalance") || "Insufficient balance. You need more SAVVA tokens."}
                  </div>
                </Show>
              </div>

              {/* Action buttons */}
              <div class="flex gap-3">
                <button
                  class="flex-1 px-4 py-3 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
                  onClick={() => setShowPurchaseDialog(false)}
                >
                  {t("common.cancel") || "Cancel"}
                </button>
                <button
                  class="flex-1 px-4 py-3 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isPurchasing() || hasEnoughBalance() === false}
                  onClick={handlePurchase}
                >
                  {isPurchasing() ? (t("post.purchase.processing") || "Processing...") : (t("post.purchase.confirm") || "Purchase Now")}
                </button>
              </div>

              {/* Small print: warnings, fee info, disclaimer */}
              <div class="mt-4 space-y-1 text-[10px] text-center text-[hsl(var(--muted-foreground))]">
                <div>{t("post.purchase.warningFinal") || "All purchases are final and non-refundable"}</div>
                <div>{t("post.purchase.warningUpdate") || "If the author updates or removes the content, you may lose access"}</div>
                <Show when={purchaseFee() && purchaseFeeAmount()}>
                  <div>
                    {formatUnits(purchaseFeeAmount(), 18)} SAVVA ({(purchaseFee() / 100).toFixed(1)}%) {t("post.purchase.buyBurnFee") || "will be sent to the BuyBurn contract"}
                  </div>
                </Show>
                <div>{t("post.purchase.disclaimer") || "By purchasing, you agree to the terms of service"}</div>
              </div>
            </div>
          </div>
        </Portal>
      </Show>
    </main>
  );
}
