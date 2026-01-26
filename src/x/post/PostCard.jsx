// src/x/post/PostCard.jsx
import { Show, Switch, Match, createMemo, createSignal, createEffect, createResource, onMount, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { createStore, reconcile } from "solid-js/store";
import { useApp } from "../../context/AppContext.jsx";
import IpfsImage from "../ui/IpfsImage.jsx";
import UserCard from "../ui/UserCard.jsx";
import UnknownUserIcon from "../ui/icons/UnknownUserIcon.jsx";
import PostInfo from "./PostInfo.jsx";
import NftBadge from "../ui/icons/NftBadge.jsx";
import PostFundBadge from "../ui/PostFundBadge.jsx";
import { navigate } from "../../routing/smartRouter.js";
import ContextMenu from "../ui/ContextMenu.jsx";
import { getPostAdminItems } from "../../ui/contextMenuBuilder.js";
import useUserProfile, { selectField } from "../profile/userProfileStore.js";
import { resolvePostCidPath, getPostContentBaseCid } from "../../ipfs/utils.js";
import { canDecryptPost, decryptPostMetadata, getReadingSecretKey, decryptPostEncryptionKey, getUserEncryptionData, isUserInRecipientsList } from "../crypto/postDecryption.js";
import { setEncryptedPostContext } from "../../ipfs/encryptedFetch.js";
import { READING_KEY_UPDATED_EVENT, storeReadingKey } from "../crypto/readingKeyStorage.js";
import { swManager } from "../crypto/serviceWorkerManager.js";
import { loadNsfwPreference } from "../preferences/storage.js";
import { formatUnits, toHex, stringToBytes } from "viem";
import TokenValue from "../ui/TokenValue.jsx";
import { getSavvaContract } from "../../blockchain/contracts.js";
import { sendAsActor } from "../../blockchain/npoMulticall.js";
import { connectWallet } from "../../blockchain/wallet.js";
import { pushToast } from "../../ui/toast.js";
import { fetchReadingKey, generateReadingKey, publishReadingKey } from "../crypto/readingKey.js";
import { toChecksumAddress } from "../../blockchain/utils.js";
import { dbg } from "../../utils/debug.js";

function PinIcon(props) {
  return (
    <svg viewBox="0 0 24 24" class={props.class || "w-5 h-5"} fill="currentColor" aria-hidden="true">
      <path d="M13.5 2.5l8 8-3.5 1.5L22 16l-2 2-4-4-1.5 3.5-8-8L10 8 13.5 2.5z" />
    </svg>
  );
}

function getLocalizedField(locales, fieldName, currentLang) {
  if (!locales || typeof locales !== "object") return "";
  if (locales[currentLang]?.[fieldName]) return locales[currentLang][fieldName];
  if (locales.en?.[fieldName]) return locales.en[fieldName];
  const firstLocaleKey = Object.keys(locales)[0];
  if (firstLocaleKey && locales[firstLocaleKey]?.[fieldName]) return locales[firstLocaleKey][fieldName];
  return "";
}

export default function PostCard(props) {
  const app = useApp();
  const { t } = app;
  const { dataStable: profile } = useUserProfile();

  const [isHovered, setIsHovered] = createSignal(false);

  // Normalize source: accept either props.item or props.post. If no _raw, create one.
  const src = () => (props.item ?? props.post ?? {});
  const normalize = (obj) => (obj && obj._raw ? obj : { _raw: obj || {}, ...obj });

  const [item, setItem] = createStore(normalize(src()));

  // Keep store in sync if caller swaps the post/item prop
  createEffect(() => {
    setItem(reconcile(normalize(src())));
  });

  // Unified accessor for the underlying record (prefers _raw if present)
  const base = () => item._raw ?? item;

  // Allow disabling the context menu via either camelCase or dashed prop
  const disableContextMenu = () => !!(props.noContextMenu ?? props["no-context-menu"]);

  const [revealed, setRevealed] = createSignal(false);
  const [showPurchaseDialog, setShowPurchaseDialog] = createSignal(false);
  const [isPurchasing, setIsPurchasing] = createSignal(false);

  // Signal to trigger re-check of decryption capability
  const [keyUpdateTrigger, setKeyUpdateTrigger] = createSignal(0);

  // Listen for reading key updates to auto-decrypt when a new key is stored
  onMount(() => {
    const handleKeyUpdate = (event) => {
      const { address, publicKey } = event.detail || {};
      const addr = app.authorizedUser()?.address; // Use app directly since userAddress memo may not be defined yet

      console.log("[PostCard] Received key update event:", {
        eventAddress: address,
        eventPublicKey: publicKey,
        myAddress: addr,
        postId: base()?.savva_cid || base()?.short_cid,
      });

      if (!addr) {
        console.log("[PostCard] No user address, ignoring event");
        return;
      }

      // Check if this update is relevant to us (same user)
      if (address && address.toLowerCase() === addr.toLowerCase()) {
        const contentData = content();
        const encData = contentData?.encryption;
        const ourPublicKey = encData?.reading_public_key?.toLowerCase();

        console.log("[PostCard] Checking public key match:", {
          ourPublicKey,
          eventPublicKey: publicKey,
          isEncrypted: !!contentData?.encrypted,
          hasEncData: !!encData,
          contentData: contentData, // Full content for debugging
        });

        // If post is encrypted and public key matches (or no publicKey filter), trigger re-check
        if (contentData?.encrypted && (ourPublicKey === publicKey || !publicKey || !ourPublicKey)) {
          console.log("[PostCard] Encrypted post, triggering re-check for post:", base()?.savva_cid || base()?.short_cid);
          setKeyUpdateTrigger(prev => prev + 1);
        }
      }
    };

    window.addEventListener(READING_KEY_UPDATED_EVENT, handleKeyUpdate);
    onCleanup(() => {
      window.removeEventListener(READING_KEY_UPDATED_EVENT, handleKeyUpdate);
    });
  });

  // Cleanup encryption context on unmount
  onCleanup(() => {
    const dataCid = getPostContentBaseCid(base());
    if (dataCid && base()?._decrypted) {
      swManager.clearEncryptionContext(dataCid).catch(() => {
        // Silently fail - context might already be cleared
      });
    }
  });

  // Listen for purchase access granted event
  onMount(() => {
    const handlePurchaseAccessGranted = async (event) => {
      const { savva_cid } = event.detail || {};
      const b = base();
      const currentCid = b?.savva_cid || b?.short_cid || b?.id;
      if (savva_cid && currentCid && String(savva_cid) === String(currentCid)) {
        dbg.log("PostCard", "Received purchase access granted for this post, refetching...");

        // Refetch the post data to get updated recipient list
        try {
          const contentList = app.wsMethod("content-list");
          const domain = app.selectedDomainName();
          const user = app.authorizedUser?.();

          const requestParams = {
            domain,
            limit: 1,
            show_nsfw: true,
            show_all_encrypted_posts: true,
            savva_cid: b.savva_cid || currentCid,
          };
          if (user?.address) {
            requestParams.my_addr = toChecksumAddress(user.address);
          }

          const res = await contentList(requestParams);
          const arr = Array.isArray(res) ? res : Array.isArray(res?.list) ? res.list : [];
          const updatedPost = arr[0];

          if (updatedPost) {
            const encData = updatedPost.savva_content?.encryption;
            const userAddr = app.authorizedUser?.()?.address;
            const normalizedAddr = userAddr?.toLowerCase();

            // Check both root level and recipients object
            const recipientData = normalizedAddr && encData?.recipients?.[normalizedAddr];
            const userEncData = (encData?.reading_key_nonce && encData?.pass)
              ? encData
              : recipientData;

            dbg.log("PostCard", "Got updated post data after purchase", {
              hasEncryption: !!encData,
              recipientCount: Object.keys(encData?.recipients || {}).length,
              recipientKeys: Object.keys(encData?.recipients || {}),
              userAddr: normalizedAddr,
              // Root level data
              hasReadingKeyNonceAtRoot: !!encData?.reading_key_nonce,
              hasReadingPublicKeyAtRoot: !!encData?.reading_public_key,
              hasPassAtRoot: !!encData?.pass,
              readingPublicKeyAtRoot: encData?.reading_public_key,
              // Recipient-specific data
              hasRecipientData: !!recipientData,
              recipientDataKeys: recipientData ? Object.keys(recipientData) : [],
              recipientReadingPublicKey: recipientData?.reading_public_key,
              recipientReadingKeyNonce: recipientData?.reading_key_nonce,
              recipientHasPass: !!recipientData?.pass,
              // Final user encryption data
              hasUserEncData: !!userEncData,
              userEncDataReadingPublicKey: userEncData?.reading_public_key,
            });

            // Check if local storage has the key
            const searchPublicKey = userEncData?.reading_public_key || encData?.reading_public_key;
            if (userAddr && searchPublicKey) {
              const { findStoredSecretKeyByPublicKey, getStoredReadingKeys } = await import("../crypto/readingKeyStorage.js");
              const storedKeys = getStoredReadingKeys(userAddr);
              const foundKey = findStoredSecretKeyByPublicKey(userAddr, searchPublicKey);
              dbg.log("PostCard", "Checking local storage for key", {
                userAddr,
                storedKeysCount: storedKeys.length,
                storedPublicKeys: storedKeys.map(k => k.publicKey?.toLowerCase()),
                searchingFor: searchPublicKey?.toLowerCase(),
                foundKey: !!foundKey,
                keysMatch: storedKeys.some(k => k.publicKey?.toLowerCase() === searchPublicKey?.toLowerCase()),
              });
            } else {
              dbg.log("PostCard", "Cannot check local storage - missing userAddr or searchPublicKey", {
                userAddr,
                searchPublicKey,
              });
            }

            // Update the store with fresh data
            const normalized = normalize(updatedPost);
            setItem(reconcile(normalized));

            // Trigger re-check of decryption capability
            setKeyUpdateTrigger(prev => prev + 1);
          }
        } catch (error) {
          dbg.error("PostCard", "Failed to refetch post after purchase", error);
          // Still trigger re-check in case local key is available
          setKeyUpdateTrigger(prev => prev + 1);
        }
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

    const authorAddress = author()?.address;
    const savvaCid = base()?.savva_cid || base()?.short_cid;
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

      // Step 2: Check and ensure allowance
      const purchaseContract = await getSavvaContract(app, "SavvaPurchase");
      const savvaToken = await getSavvaContract(app, "SavvaToken");
      const priceWei = BigInt(info.priceWei);
      const allowance = await savvaToken.read.allowance([actorAddr, purchaseContract.address]);

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
      dbg.error("PostCard", "Purchase failed", error);
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

  // Live updates
  let lastPostUpdate;

  createEffect(() => {
    const update = app.postUpdate?.();
    if (!update || update === lastPostUpdate) return;
    lastPostUpdate = update;

    // Author-level updates: apply to all posts by that author
    if (update.type === "authorBanned" || update.type === "authorUnbanned") {
      const b = base();
      const myAuthor = (b?.author?.address || item.author?.address || "").toLowerCase();
      if (myAuthor && myAuthor === (update.author || "").toLowerCase()) {
        setItem("_raw", "author_banned", update.type === "authorBanned");
      }
      return;
    }

    // Post-level updates: gate by cid/id
    const b = base();
    const myCid = b?.savva_cid || b?.id || item.id;
    if (update.cid !== myCid) return;

    if (update.type === "reactionsChanged") {
      setItem("_raw", "reactions", reconcile(update.data.reactions));
      if (app.authorizedUser()?.address?.toLowerCase() === update.data?.user?.toLowerCase()) {
        setItem("_raw", "my_reaction", update.data.reaction);
      }
    } else if (update.type === "commentCountChanged") {
      setItem("_raw", "total_childs", update.data.newTotal);
    } else if (update.type === "fundChanged" && update.data.fund) {
      setItem("_raw", "fund", (prev) => ({ ...prev, ...update.data.fund }));
    } else if (update.type === "postBanned") {
      setItem("_raw", "banned", true);
    } else if (update.type === "postUnbanned") {
      setItem("_raw", "banned", false);
    }
  });

  const author = () => base()?.author;
  const content = () => base()?.savva_content ?? base()?.content;
  const fund = () => base()?.fund;
  const isListMode = () => props.mode === "list";

  // Encryption handling
  const isEncrypted = createMemo(() => !!(content()?.encrypted && !base()?._decrypted));
  const userAddress = createMemo(() => app.authorizedUser()?.address);

  const canDecrypt = createMemo(() => {
    // React to key update events
    const trigger = keyUpdateTrigger();
    const postId = base()?.savva_cid || base()?.short_cid;

    const encrypted = isEncrypted();
    const addr = userAddress();
    const encData = content()?.encryption;

    console.log("[PostCard] canDecrypt memo evaluating:", {
      postId,
      trigger,
      isEncrypted: encrypted,
      isDecrypted: base()?._decrypted,
      contentEncrypted: content()?.encrypted,
      hasAddr: !!addr,
      addr: addr,
      hasEncData: !!encData,
      readingPublicKey: encData?.reading_public_key,
      readingKeyNonce: encData?.reading_key_nonce,
      hasPass: !!encData?.pass,
      recipientCount: encData?.recipients ? Object.keys(encData.recipients).length : 0,
    });

    if (!encrypted) {
      console.log("[PostCard] canDecrypt: returning false because not encrypted");
      return false;
    }
    if (!addr) {
      console.log("[PostCard] canDecrypt: returning false because no addr");
      return false;
    }
    if (!encData) {
      console.log("[PostCard] canDecrypt: returning false because no encData");
      return false;
    }

    const result = canDecryptPost(addr, encData);
    console.log("[PostCard] canDecrypt result for", postId, ":", result);
    return result;
  });

  // Check if user is in recipients list (has encryption data, even if key not stored yet)
  const isUserInRecipients = createMemo(() => {
    const postId = base()?.savva_cid || base()?.short_cid;
    if (!isEncrypted()) return false;
    const encData = content()?.encryption;
    console.log("[PostCard] isUserInRecipients check:", {
      postId,
      hasEncData: !!encData,
      reading_key_nonce: encData?.reading_key_nonce,
      hasRecipients: !!encData?.recipients,
      userAddress: userAddress(),
      encDataKeys: encData ? Object.keys(encData) : [],
    });
    if (!encData) return false;
    const result = isUserInRecipientsList(userAddress(), encData);
    console.log("[PostCard] isUserInRecipients result:", { postId, result });
    return result;
  });

  // Auto-decrypt if we have the key stored
  createEffect(async () => {
    const postId = base()?.savva_cid || base()?.short_cid;

    console.log("[PostCard] Auto-decrypt effect triggered:", {
      postId,
      isEncrypted: isEncrypted(),
      isDecrypted: base()?._decrypted,
      canDecrypt: canDecrypt(),
      keyUpdateTrigger: keyUpdateTrigger(),
    });

    if (!isEncrypted() || base()?._decrypted) {
      console.log("[PostCard] Skipping: not encrypted or already decrypted", { postId });
      return;
    }
    if (!canDecrypt()) {
      console.log("[PostCard] Skipping: canDecrypt is false", { postId });
      return;
    }

    console.log("[PostCard] Starting auto-decrypt for post:", postId);

    try {
      const addr = userAddress();
      const originalBase = base();
      const postContent = originalBase?.savva_content || originalBase?.content;
      const encryptionData = postContent?.encryption;

      // Get user-specific encryption data (might be at root or in recipients object)
      const userEncData = getUserEncryptionData(addr, encryptionData);
      if (!userEncData) {
        console.error("[PostCard] User not in recipients list - no user-specific encryption data");
        return;
      }

      console.log("[PostCard] Got user encryption data:", {
        hasReadingKeyNonce: !!userEncData.reading_key_nonce,
        hasReadingPublicKey: !!userEncData.reading_public_key,
        hasPass: !!userEncData.pass,
      });

      // Get the post secret key for decryption (pass publicKey for cross-post key lookup)
      const readingKey = await getReadingSecretKey(
        addr,
        userEncData.reading_key_nonce,
        false, // forceRecover
        userEncData.reading_public_key // publicKey for lookup
      );
      if (!readingKey) {
        console.error("[PostCard] Failed to get reading secret key");
        return;
      }

      const postSecretKey = await decryptPostEncryptionKey(userEncData, readingKey);
      if (!postSecretKey) {
        console.error("[PostCard] Failed to decrypt post encryption key");
        return;
      }

      // Decrypt the metadata
      const decrypted = await decryptPostMetadata(originalBase, addr, readingKey);

      // Set up encryption context for IPFS fetches (thumbnails, images, etc.)
      const dataCid = getPostContentBaseCid(originalBase);
      if (dataCid && postSecretKey) {
        // Set context for blob-based decryption (fallback)
        setEncryptedPostContext({ dataCid, postSecretKey });

        // Set context in Service Worker for streaming decryption
        swManager.setEncryptionContext(dataCid, postSecretKey).catch(err => {
          console.warn('[PostCard] Failed to set SW encryption context:', err);
          // Fallback to blob-based decryption will still work
        });

        console.log("[PostCard] Set encryption context for:", {
          cid: originalBase?.savva_cid || originalBase?.short_cid,
          dataCid,
          hasThumbnail: !!postContent?.thumbnail,
          thumbnailPath: postContent?.thumbnail,
        });
      }

      // Ensure we preserve all original fields (short_cid, savva_cid, etc)
      const merged = { ...originalBase, ...decrypted };

      // Update the item with decrypted data
      setItem("_raw", reconcile(merged));
      setItem(reconcile({ _raw: merged, ...merged }));
    } catch (error) {
      console.error("Auto-decryption failed:", error);
    }
  });


  const displayImageSrc = createMemo(() => {
    const thumbnailPath = content()?.thumbnail;
    if (thumbnailPath) return resolvePostCidPath(base(), thumbnailPath);
    return author()?.avatar;
  });

  const title = createMemo(() => getLocalizedField(content()?.locales, "title", app.lang()));
  const textPreview = createMemo(() => getLocalizedField(content()?.locales, "text_preview", app.lang()));

  // Sensitive flag + user preference
  const isSensitive = createMemo(() => !!(base()?.nsfw || content()?.nsfw));
  const nsfwPref = createMemo(() => loadNsfwPreference());
  const shouldCover = createMemo(() => isSensitive() && nsfwPref() === "w" && !revealed());

  // Encrypted content cover (takes precedence over NSFW)
  const shouldCoverEncrypted = createMemo(() => isEncrypted() && !canDecrypt());

  // Purchase access info
  const purchaseInfo = createMemo(() => {
    const encData = content()?.encryption;
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
        dbg.warn("PostCard", "Failed to fetch purchase fee", e);
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

  // Banned ribbons
  const isBannedPost = createMemo(() => !!base()?.banned);
  const isBannedAuthor = createMemo(() => !!(base()?.author_banned || base()?.author?.banned));

  const handleCardClick = (e) => {
    // Only block navigation for NSFW cover, not encrypted content
    // (PostPage will handle encrypted content display)
    if (shouldCover()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const b = base();
    // Prefer short_cid, fallback to savva_cid, then id
    const id = b?.short_cid || b?.savva_cid || b?.id || item.short_cid || item.savva_cid || item.id;
    if (id) {
      app.setSavedScrollY?.(window.scrollY);

      // Only add lang param if post has multiple languages
      const locales = content()?.locales || {};
      const localeCount = Object.keys(locales).length;
      const currentLang = (app.lang?.() || "").toLowerCase();
      const url = (localeCount > 1 && currentLang) ? `/post/${id}?lang=${currentLang}` : `/post/${id}`;

      navigate(url);
    }
  };

  const finalContextMenuItems = createMemo(() => {
    const propItems = props.contextMenuItems || [];
    const adminItems = getPostAdminItems(base(), t);
    return [...propItems, ...adminItems];
  });

  const articleClasses = createMemo(() => {
    const baseCls = "relative rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] flex";
    return isListMode() ? `${baseCls} flex-row ${props.compact ? "h-20" : "h-40"}` : `${baseCls} flex-col`;
  });

  const imageContainerClasses = createMemo(() => {
    const listModeRounding = isListMode() ? "rounded-l-lg" : "rounded-t-lg";
    return `relative shrink-0 overflow-hidden ${listModeRounding} ${isListMode() ? "h-full aspect-video border-r" : "aspect-video w-full border-b"} border-[hsl(var(--border))]`;
  });

  const ImageBlock = () => {
    const roundingClass = isListMode() ? "rounded-l-lg" : "rounded-t-lg";
    return (
      <div class={imageContainerClasses()}>
        <IpfsImage
          src={displayImageSrc()}
          class={roundingClass}
          postGateways={base()?.gateways || []}
          fallback={<UnknownUserIcon class={`absolute inset-0 w-full h-full ${roundingClass}`} />}
        />

        <Show when={fund()?.amount > 0 && fund()?.round_time > 0}>
          <div class="absolute bottom-2 right-0 z-10">
            <PostFundBadge amount={fund()?.amount} />
          </div>
        </Show>

        {/* Encrypted content warning (takes precedence) */}
        <Show when={shouldCoverEncrypted()}>
          <div
            class="absolute inset-0 rounded-[inherit] z-20 flex items-center justify-center cursor-pointer"
            onClick={handleCardClick}
          >
            <div class="absolute inset-0 rounded-[inherit] bg-[hsl(var(--card))]/90 backdrop-blur-md" />
            <div class="relative z-10 flex flex-col items-center gap-2 text-center px-4">
              <svg class="w-10 h-10 text-[hsl(var(--muted-foreground))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <div class="text-sm font-semibold text-[hsl(var(--foreground))]">
                {t("post.encrypted.title") || "Encrypted Content"}
              </div>
              <div class="text-xs text-[hsl(var(--muted-foreground))]">
                {t("post.encrypted.subscribersOnly") || "This post is encrypted for subscribers only"}
              </div>

              {/* Unlock button when user has access (is in recipients) */}
              <Show when={isUserInRecipients()}>
                <button
                  class="mt-2 px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleCardClick(e);
                  }}
                >
                  <span class="text-xs font-medium">
                    {t("post.encrypted.unlock") || "Unlock Content"}
                  </span>
                </button>
              </Show>

              {/* Purchase access option - only when user is authorized and NOT in recipients */}
              <Show when={userAddress() && !isUserInRecipients() && purchaseInfo()}>
                <button
                  class="mt-2 px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity flex items-center gap-2"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowPurchaseDialog(true);
                  }}
                >
                  <span class="text-xs font-medium flex items-center gap-1">
                    {t("post.encrypted.buyAccess") || "Buy access"} —
                    <TokenValue
                      amount={purchaseInfo().priceWei}
                      tokenAddress={purchaseInfo().purchaseToken}
                      format="inline"
                    />
                  </span>
                </button>
                <div class="text-[10px] text-[hsl(var(--muted-foreground))] italic">
                  {t("post.encrypted.buyAccessHint") || "One-time payment for permanent access"}
                </div>
              </Show>

              {/* Connect wallet prompt - when not authorized but purchase is available */}
              <Show when={!userAddress() && purchaseInfo()}>
                <button
                  class="mt-2 px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    await connectWallet();
                  }}
                >
                  <span class="text-xs font-medium">
                    {t("wallet.connect") || "Connect wallet"}
                  </span>
                </button>
                <div class="text-[10px] text-[hsl(var(--muted-foreground))] italic">
                  {t("post.encrypted.connectToBuy") || "Connect to buy access"}
                </div>
              </Show>
            </div>
          </div>
        </Show>

        {/* NSFW warning over the image (shown if not encrypted) */}
        <Show when={shouldCover() && !shouldCoverEncrypted()}>
          <div
            class="absolute inset-0 rounded-[inherit] z-20 flex items-center justify-center"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div class="absolute inset-0 rounded-[inherit] bg-[hsl(var(--card))]/80 backdrop-blur-md" />
            <div class="relative z-10 flex flex-col items-center gap-3 text-center px-4">
              <div class="text-sm text-[hsl(var(--muted-foreground))]">{t("nsfw.cover.warning")}</div>
              <button
                class="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setRevealed(true);
                }}
              >
                {t("nsfw.cover.show")}
              </button>
            </div>
          </div>
        </Show>
      </div>
    );
  };

  const contentContainerClasses = createMemo(() =>
    isListMode() ? "px-3 py-2 flex-1 flex flex-col min-w-0" : "p-3 flex-1 flex flex-col"
  );

  const textPreviewClasses = createMemo(() => {
    const baseCls = "text-xs leading-snug text-[hsl(var(--muted-foreground))]";
    return isListMode() ? `${baseCls} ${props.compact ? "line-clamp-1" : "line-clamp-2"}` : `${baseCls} line-clamp-3`;
  });

  const TitlePreviewBlock = () => (
    <div class="relative">
      <div>
        <Show when={title()}>
          <h4 class={`font-semibold line-clamp-3 text-[hsl(var(--foreground))] ${props.compact ? "text-xs" : "text-sm"}`}>{title()}</h4>
        </Show>
        <Show when={textPreview() && !props.compact}>
          <div class="relative">
            <p class={textPreviewClasses()}>{textPreview()}</p>
            {/* Blur mask only over preview text when encrypted (title stays visible) */}
            <Show when={shouldCoverEncrypted()}>
              <div
                class="absolute inset-0 z-10 rounded-md bg-[hsl(var(--card))]/70 backdrop-blur-[2px]"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              />
            </Show>
          </div>
        </Show>
      </div>

      {/* Thin mask over entire text area when NSFW (but not encrypted) */}
      <Show when={shouldCover() && !shouldCoverEncrypted()}>
        <div
          class="absolute inset-0 z-10 rounded-md bg-[hsl(var(--card))]/70 backdrop-blur-[2px]"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
      </Show>
    </div>
  );

  const ContentBlock = () => (
    <div class={contentContainerClasses()}>
      <div class="flex-1 flex flex-col space-y-1 min-h-0">
        <div class="flex-1">
          <TitlePreviewBlock />
        </div>
        <div class="pt-1">
          <UserCard author={author()} compact={props.compact} />
        </div>
      </div>

      <Show when={!props.compact}>
        <PostInfo item={item} mode={props.mode} timeFormat="long" />
      </Show>
    </div>
  );

  return (
    <article
      class={articleClasses()}
      onClick={handleCardClick}
      style={{ cursor: "pointer" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Show when={base()?.pinned}>
        <div class="absolute -top-2 -left-2 z-10">
          <PinIcon class="w-5 h-5 text-[hsl(var(--primary))]" />
        </div>
      </Show>

      <Show when={base()?.nft?.owner}>
        <div class="absolute -top-2 -right-2 z-10">
          <NftBadge width="30" height="30" />
        </div>
      </Show>

      {/* BANNED ribbons (above NSFW overlay, below context button) */}
      <Show when={isBannedPost() || isBannedAuthor()}>
        <div class="pointer-events-none absolute top-2 left-2 z-19 space-y-1">
          <Show when={isBannedPost()}>
            <div class="inline-flex items-center px-2 py-1 rounded-md uppercase text-[10px] font-extrabold tracking-wider bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] shadow">
              {t("post.bannedPost")}
            </div>
          </Show>
          <Show when={isBannedAuthor()}>
            <div class="inline-flex items-center px-2 py-1 rounded-md uppercase text-[10px] font-extrabold tracking-wider bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] shadow">
              {t("post.bannedAuthor")}
            </div>
          </Show>
        </div>
      </Show>

      {/* Context button on top (hidden when no-context-menu is set) */}
      <Show when={!disableContextMenu() && app.authorizedUser()?.isAdmin && finalContextMenuItems().length > 0}>
        <div class="pointer-events-none absolute top-2 right-2 z-40">
          <div class="pointer-events-auto">
            <Show when={isHovered()}>
              <ContextMenu
                items={finalContextMenuItems()}
                positionClass="relative z-40"
                buttonClass="p-1 rounded-md bg-[hsl(var(--background))]/80 backdrop-blur-[2px] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
              />
            </Show>
          </div>
        </div>
      </Show>

      <Show
        when={isListMode()}
        fallback={
          <>
            <ImageBlock />
            <ContentBlock />
          </>
        }
      >
        {isListMode() ? (
          <>
            <ContentBlock />
            <ImageBlock />
          </>
        ) : (
          <>
            <ImageBlock />
            <ContentBlock />
          </>
        )}
      </Show>

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
                <UserCard author={author()} />
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
                  disabled={isPurchasing()}
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
    </article>
  );
}
