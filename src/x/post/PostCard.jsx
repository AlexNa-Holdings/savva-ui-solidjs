// src/x/feed/PostCard.jsx
import { Show, createMemo, createSignal, createEffect } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { useApp } from "../../context/AppContext.jsx";
import IpfsImage from "../ui/IpfsImage.jsx";
import UserCard from "../ui/UserCard.jsx";
import UnknownUserIcon from "../ui/icons/UnknownUserIcon.jsx";
import PostInfo from "../post/PostInfo.jsx";
import NftBadge from "../ui/icons/NftBadge.jsx";
import PostFundBadge from "../ui/PostFundBadge.jsx";
import { navigate } from "../../routing/hashRouter.js";
import ContextMenu from "../ui/ContextMenu.jsx";
import { getPostAdminItems } from "../../ui/contextMenuBuilder.js";
import { resolvePostCidPath } from "../../ipfs/utils.js";

function PinIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class={`${props.class} scale-x-[-1]`}>
      <g id="SVGRepo_bgCarrier" stroke-width="0"></g>
      <g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g>
      <g id="SVGRepo_iconCarrier">
        <path d="M19.1835 7.80516L16.2188 4.83755C14.1921 2.8089 13.1788 1.79457 12.0904 2.03468C11.0021 2.2748 10.5086 3.62155 9.5217 6.31506L8.85373 8.1381C8.59063 8.85617 8.45908 9.2152 8.22239 9.49292C8.11619 9.61754 7.99536 9.72887 7.86251 9.82451C7.56644 10.0377 7.19811 10.1392 6.46145 10.3423C4.80107 10.8 3.97088 11.0289 3.65804 11.5721C3.5228 11.8069 3.45242 12.0735 3.45413 12.3446C3.45809 12.9715 4.06698 13.581 5.28476 14.8L6.69935 16.2163L2.22345 20.6964C1.92552 20.9946 1.92552 21.4782 2.22345 21.7764C2.52138 22.0746 3.00443 22.0746 3.30236 21.7764L7.77841 17.2961L9.24441 18.7635C10.4699 19.9902 11.0827 20.6036 11.7134 20.6045C11.9792 20.6049 12.2404 20.5358 12.4713 20.4041C13.0192 20.0914 13.2493 19.2551 13.7095 17.5825C13.9119 16.8472 14.013 16.4795 14.2254 16.1835C14.3184 16.054 14.4262 15.9358 14.5468 15.8314C14.8221 15.593 15.1788 15.459 15.8922 15.191L17.7362 14.4981C20.4 13.4973 21.7319 12.9969 21.9667 11.9115C22.2014 10.826 21.1954 9.81905 19.1835 7.80516Z" fill="currentColor"></path>
      </g>
    </svg>
  );
}

function getLocalizedField(locales, fieldName, currentLang) {
  if (!locales || typeof locales !== 'object') return "";
  if (locales[currentLang]?.[fieldName]) return locales[currentLang][fieldName];
  if (locales.en?.[fieldName]) return locales.en[fieldName];
  const firstLocaleKey = Object.keys(locales)[0];
  if (firstLocaleKey && locales[firstLocaleKey]?.[fieldName]) {
    return locales[firstLocaleKey][fieldName];
  }
  return "";
}

export default function PostCard(props) {
  const app = useApp();
  const { t } = app;
  const [isHovered, setIsHovered] = createSignal(false);
  const [item, setItem] = createStore(props.item);

  createEffect(() => {
    const update = app.postUpdate();
    if (!update || update.cid !== item.id) return;

    if (update.type === 'reactionsChanged') {
      setItem("_raw", "reactions", reconcile(update.data.reactions));
      if (app.authorizedUser()?.address?.toLowerCase() === update.data?.user?.toLowerCase()) {
        setItem("_raw", "my_reaction", update.data.reaction);
      }
    } else if (update.type === 'commentCountChanged') {
      setItem("_raw", "total_childs", update.data.newTotal);
    } else if (update.type === 'fundChanged' && update.data.fund) {
      setItem("_raw", "fund", (prev) => ({ ...prev, ...update.data.fund }));
    }
  });

  const author = () => item._raw?.author;
  const content = () => item._raw?.savva_content;
  const fund = () => item._raw?.fund;
  const isListMode = () => props.mode === 'list';

  const displayImageSrc = createMemo(() => {
    const thumbnailPath = content()?.thumbnail;
    if (thumbnailPath) {
      return resolvePostCidPath(item._raw, thumbnailPath);
    }
    return author()?.avatar;
  });

  const title = createMemo(() => getLocalizedField(content()?.locales, "title", app.lang()));
  const textPreview = createMemo(() => getLocalizedField(content()?.locales, "text_preview", app.lang()));

  const handleCardClick = (e) => {
    if (item.id) {
      app.setSavedScrollY(window.scrollY);
      navigate(`/post/${item.id}`);
    } else {
      console.warn("PostCard: Could not find post ID to navigate.", { item: item });
    }
  };

  const finalContextMenuItems = createMemo(() => {
    const propItems = props.contextMenuItems || [];
    const adminItems = getPostAdminItems(item._raw, t);
    return [...propItems, ...adminItems];
  });

  const articleClasses = createMemo(() => {
    const base = "relative rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] flex";
    if (isListMode()) {
      return `${base} flex-row ${props.compact ? 'h-20' : 'h-40'}`;
    }
    return `${base} flex-col`;
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
      </div>
    );
  };

  const contentContainerClasses = createMemo(() => (
    isListMode() ? "px-3 py-2 flex-1 flex flex-col min-w-0" : "p-3 flex-1 flex flex-col"
  ));

  const textPreviewClasses = createMemo(() => {
    const base = "text-xs leading-snug text-[hsl(var(--muted-foreground))]";
    if (isListMode()) {
      return `${base} ${props.compact ? 'line-clamp-1' : 'line-clamp-2'}`;
    }
    return `${base} line-clamp-3`;
  });

  const ContentBlock = () => (
    <div class={contentContainerClasses()}>
      <div class="flex-1 flex flex-col space-y-1 min-h-0">
        <div class="flex-1">
          <Show when={title()}>
            <h4 class={`font-semibold line-clamp-3 text-[hsl(var(--foreground))] ${props.compact ? 'text-xs' : 'text-sm'}`}>
              {title()}
            </h4>
          </Show>
          <Show when={textPreview() && !props.compact}>
            <p class={textPreviewClasses()}>
              {textPreview()}
            </p>
          </Show>
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
      style={{ cursor: 'pointer' }}
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

      {/* Context menu toggle: fixed overlay in bottom-right, no layout shift */}
      <Show when={app.authorizedUser()?.isAdmin && finalContextMenuItems().length > 0}>
        <div class="pointer-events-none absolute top-2 right-2 z-20">
          <div class="pointer-events-auto">
            <Show when={isHovered()}>
              <ContextMenu
                items={finalContextMenuItems()}
                positionClass="relative z-20"
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

