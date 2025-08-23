// src/components/feed/PostCard.jsx
import { Show, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import IpfsImage from "../ui/IpfsImage.jsx";
import UserCard from "../ui/UserCard.jsx";
import UnknownUserIcon from "../ui/icons/UnknownUserIcon.jsx";
import PostInfo from "./PostInfo.jsx";

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
    const base = "rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] flex overflow-hidden";
    return isListMode() ? `${base} flex-row h-40` : `${base} flex-col`;
  });

  const imageContainerClasses = createMemo(() => {
    return isListMode()
      ? "h-full shrink-0 aspect-video border-l border-[hsl(var(--border))]"
      : "aspect-video w-full border-b border-[hsl(var(--border))]";
  });

  const contentContainerClasses = createMemo(() => {
    return isListMode()
      // Reduced vertical padding from p-3 to py-2
      ? "px-3 py-2 flex-1 flex flex-col min-w-0"
      : "px-3 pb-3 flex-1 flex flex-col";
  });

  const textPreviewClasses = createMemo(() => {
    const base = "text-xs leading-snug text-[hsl(var(--muted-foreground))]";
    return isListMode() ? `${base} line-clamp-2` : `${base} line-clamp-3`;
  });

  const ImageBlock = () => (
    <div class={imageContainerClasses()}>
      <Show
        when={displayImageSrc()}
        fallback={<UnknownUserIcon class="absolute inset-0 w-full h-full" />}
      >
        {(cid) => <IpfsImage src={cid()} />}
      </Show>
    </div>
  );

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