// src/components/feed/PostCard.jsx
import { Show, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import IpfsImage from "../ui/IpfsImage.jsx";
import UserCard from "../ui/UserCard.jsx";
import UnknownUserIcon from "../ui/icons/UnknownUserIcon.jsx";
import PostInfo from "./PostInfo.jsx";
import NftBadge from "../ui/icons/NftBadge.jsx";
import PostFundBadge from "../ui/PostFundBadge.jsx";

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
  const author = () => props.item._raw?.author;
  const content = () => props.item._raw?.savva_content;
  const fund = () => props.item._raw?.fund;
  const isListMode = () => props.mode === 'list';
  
  const displayImageSrc = createMemo(() => {
    return content()?.thumbnail || author()?.avatar;
  });

  const title = createMemo(() => {
    return getLocalizedField(content()?.locales, "title", app.lang());
  });

  const textPreview = createMemo(() => {
    return getLocalizedField(content()?.locales, "text_preview", app.lang());
  });

  const articleClasses = createMemo(() => {
    const base = "relative rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] flex";
    return isListMode() ? `${base} flex-row h-40` : `${base} flex-col`;
  });

  const imageContainerClasses = createMemo(() => {
    const listModeRounding = isListMode() ? "rounded-r-lg" : "rounded-t-lg";
    return `relative shrink-0 ${listModeRounding} ${isListMode() ? "h-full aspect-video border-l" : "aspect-video w-full border-b"} border-[hsl(var(--border))]`;
  });

  const ImageBlock = () => {
    const roundingClass = isListMode() ? "rounded-r-lg" : "rounded-t-lg";
    return (
      <div class={imageContainerClasses()}>
        <IpfsImage
          src={displayImageSrc()}
          class={roundingClass}
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

  const contentContainerClasses = createMemo(() => {
    return isListMode()
      ? "px-3 py-2 flex-1 flex flex-col min-w-0"
      : "px-3 pb-3 flex-1 flex flex-col";
  });

  const textPreviewClasses = createMemo(() => {
    const base = "text-xs leading-snug text-[hsl(var(--muted-foreground))]";
    return isListMode() ? `${base} line-clamp-2` : `${base} line-clamp-3`;
  });

  const ContentBlock = () => (
    <div class={contentContainerClasses()}>
      <div class="flex-1 space-y-1 min-h-0">
        <Show when={title()}>
          <h4 class="font-semibold line-clamp-2 text-sm text-[hsl(var(--foreground))]">
            {title()}
          </h4>
        </Show>
        <Show when={textPreview()}>
          <p class={textPreviewClasses()}>
            {textPreview()}
          </p>
        </Show>
      </div>
      
      <div class="mt-1">
        <UserCard author={author()} />
      </div>

      <PostInfo item={props.item} mode={props.mode} />
    </div>
  );

  return (
    <article class={articleClasses()}>
      <Show when={props.item._raw?.nft?.owner}>
        <div class="absolute -top-2 -right-2 z-10">
          <NftBadge />
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
        <ContentBlock />
        <ImageBlock />
      </Show>
    </article>
  );
}