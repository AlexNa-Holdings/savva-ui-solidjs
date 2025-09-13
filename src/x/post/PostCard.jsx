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
import { navigate } from "../../routing/hashRouter.js";
import ContextMenu from "../ui/ContextMenu.jsx";
import { getPostAdminItems } from "../../ui/contextMenuBuilder.js";
import useUserProfile, { selectField } from "../profile/userProfileStore.js";
import { resolvePostCidPath } from "../../ipfs/utils.js";

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
  const [item, setItem] = createStore(props.item);
  const [revealed, setRevealed] = createSignal(false);

  // Live updates
  createEffect(() => {
    const update = app.postUpdate?.();
    if (!update) return;

    // Author-level updates: apply to all posts by that author
    if (update.type === "authorBanned" || update.type === "authorUnbanned") {
      const myAuthor = (item._raw?.author?.address || item.author?.address || "").toLowerCase();
      if (myAuthor && myAuthor === (update.author || "").toLowerCase()) {
        setItem("_raw", "author_banned", update.type === "authorBanned");
      }
      return;
    }

    // Post-level updates: gate by cid/id
    const myCid = item._raw?.savva_cid || item._raw?.id || item.id;
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

  const author = () => item._raw?.author;
  const content = () => item._raw?.savva_content;
  const fund = () => item._raw?.fund;
  const isListMode = () => props.mode === "list";

  const displayImageSrc = createMemo(() => {
    const thumbnailPath = content()?.thumbnail;
    if (thumbnailPath) return resolvePostCidPath(item._raw, thumbnailPath);
    return author()?.avatar;
  });

  const title = createMemo(() => getLocalizedField(content()?.locales, "title", app.lang()));
  const textPreview = createMemo(() => getLocalizedField(content()?.locales, "text_preview", app.lang()));

  // Sensitive flag + user preference
  const isSensitive = createMemo(() => !!(item._raw?.nsfw || content()?.nsfw));
  const nsfwPref = createMemo(() => {
    const p = profile();
    return selectField(p, "nsfw") ?? selectField(p, "prefs.nsfw") ?? "h";
  });
  const shouldCover = createMemo(() => isSensitive() && nsfwPref() === "w" && !revealed());

  // Banned ribbons
  const isBannedPost = createMemo(() => !!item._raw?.banned);
  const isBannedAuthor = createMemo(() => !!(item._raw?.author_banned || item._raw?.author?.banned));

  const handleCardClick = (e) => {
    if (shouldCover()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (item.id) {
      app.setSavedScrollY?.(window.scrollY);
      navigate(`/post/${item.id}`);
    }
  };

  const finalContextMenuItems = createMemo(() => {
    const propItems = props.contextMenuItems || [];
    const adminItems = getPostAdminItems(item._raw, t);
    return [...propItems, ...adminItems];
  });

  const articleClasses = createMemo(() => {
    const base = "relative rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] flex";
    return isListMode() ? `${base} flex-row ${props.compact ? "h-20" : "h-40"}` : `${base} flex-col`;
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
          postGateways={item._raw?.gateways || []}
          fallback={<UnknownUserIcon class={`absolute inset-0 w-full h-full ${roundingClass}`} />}
        />

        <Show when={fund()?.amount > 0 && fund()?.round_time > 0}>
          <div class="absolute bottom-2 right-0 z-10">
            <PostFundBadge amount={fund()?.amount} />
          </div>
        </Show>

        {/* NSFW warning over the image */}
        <Show when={shouldCover()}>
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
    const base = "text-xs leading-snug text-[hsl(var(--muted-foreground))]";
    return isListMode() ? `${base} ${props.compact ? "line-clamp-1" : "line-clamp-2"}` : `${base} line-clamp-3`;
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
      <Show when={shouldCover()}>
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
      <Show when={item._raw?.pinned}>
        <div class="absolute -top-2 -left-2 z-10">
          <PinIcon class="w-5 h-5 text-[hsl(var(--primary))]" />
        </div>
      </Show>

      <Show when={item._raw?.nft?.owner}>
        <div class="absolute -top-2 -right-2 z-10">
          <NftBadge />
        </div>
      </Show>

      {/* BANNED ribbons (above NSFW overlay, below context button) */}
      <Show when={isBannedPost() || isBannedAuthor()}>
        <div class="pointer-events-none absolute top-2 left-2 z-30 space-y-1">
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

      {/* Context button on top */}
      <Show when={app.authorizedUser()?.isAdmin && finalContextMenuItems().length > 0}>
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
