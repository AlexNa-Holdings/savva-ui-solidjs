// src/x/post/PostCard.jsx
import { Show, Switch, Match, createMemo, createSignal, createEffect, onMount, onCleanup } from "solid-js";
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
import { canDecryptPost, decryptPostMetadata, getReadingSecretKey, decryptPostEncryptionKey } from "../crypto/postDecryption.js";
import { setEncryptedPostContext } from "../../ipfs/encryptedFetch.js";
import { swManager } from "../crypto/serviceWorkerManager.js";

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

  // Cleanup encryption context on unmount
  onCleanup(() => {
    const dataCid = getPostContentBaseCid(base());
    if (dataCid && base()?._decrypted) {
      swManager.clearEncryptionContext(dataCid).catch(() => {
        // Silently fail - context might already be cleared
      });
    }
  });

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
    if (!isEncrypted()) return false;
    const addr = userAddress();
    if (!addr) return false;
    const encData = content()?.encryption;
    if (!encData) return false;
    return canDecryptPost(addr, encData);
  });

  // Auto-decrypt if we have the key stored
  createEffect(async () => {
    if (!isEncrypted() || base()?._decrypted) return;
    if (!canDecrypt()) return;

    try {
      const addr = userAddress();
      const originalBase = base();
      const content = originalBase?.savva_content || originalBase?.content;
      const encryptionData = content?.encryption;

      // Get the post secret key for decryption
      const readingKey = await getReadingSecretKey(addr, encryptionData.reading_key_nonce);
      if (!readingKey) {
        console.error("[PostCard] Failed to get reading secret key");
        return;
      }

      const postSecretKey = decryptPostEncryptionKey(encryptionData, readingKey);
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
          hasThumbnail: !!content?.thumbnail,
          thumbnailPath: content?.thumbnail,
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
  const nsfwPref = createMemo(() => {
    const p = profile();
    return selectField(p, "nsfw") ?? selectField(p, "prefs.nsfw") ?? "h";
  });
  const shouldCover = createMemo(() => isSensitive() && nsfwPref() === "w" && !revealed());

  // Encrypted content cover (takes precedence over NSFW)
  const shouldCoverEncrypted = createMemo(() => isEncrypted() && !canDecrypt());

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
            <div class="relative z-10 flex flex-col items-center gap-3 text-center px-4">
              <svg class="w-12 h-12 text-[hsl(var(--muted-foreground))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <div class="text-sm font-semibold text-[hsl(var(--foreground))]">
                {t("post.encrypted.title") || "Encrypted Content"}
              </div>
              <div class="text-xs text-[hsl(var(--muted-foreground))]">
                {t("post.encrypted.description") || "Click to view"}
              </div>
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
          <p class={textPreviewClasses()}>{textPreview()}</p>
        </Show>
      </div>

      {/* Thin mask over text area when covered */}
      <Show when={shouldCover() || shouldCoverEncrypted()}>
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
    </article>
  );
}
