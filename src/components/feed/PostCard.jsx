// src/components/feed/PostCard.jsx
import { Show, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import IpfsImage from "../ui/IpfsImage.jsx";
import UserCard from "../ui/UserCard.jsx";
import UnknownUserIcon from "../ui/icons/UnknownUserIcon.jsx";

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
  
  const displayImageSrc = createMemo(() => {
    return content()?.thumbnail || author()?.avatar;
  });

  const title = createMemo(() => {
    return getLocalizedField(content()?.locales, "title", app.lang());
  });

  const textPreview = createMemo(() => {
    return getLocalizedField(content()?.locales, "text_preview", app.lang());
  });

  return (
    <article class="flex flex-col rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]">
      <div class="aspect-video w-full overflow-hidden rounded-t-lg border-b border-[hsl(var(--border))]">
        <Show
          when={displayImageSrc()}
          fallback={<UnknownUserIcon class="w-full h-full object-cover" />}
        >
          {(cid) => <IpfsImage src={cid()} />}
        </Show>
      </div>

      <div class="px-3 pb-3 flex-1 flex flex-col">
        <div class="pt-2">
            <UserCard author={author()} />
        </div>
        
        <div class="space-y-1 mt-2">
          <Show when={title()}>
            <h4 class="font-semibold line-clamp-2 text-sm text-[hsl(var(--foreground))]">
              {title()}
            </h4>
          </Show>
          <Show when={textPreview()}>
            <p class="text-xs leading-snug text-[hsl(var(--muted-foreground))] line-clamp-3">
              {textPreview()}
            </p>
          </Show>
        </div>

        <div class="mt-auto pt-2 text-xs text-[hsl(var(--muted-foreground))] border-t border-[hsl(var(--border))]">
          — Posted just now
        </div>
      </div>
    </article>
  );
}