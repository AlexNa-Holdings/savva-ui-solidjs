// src/x/post/BannedBanner.jsx
import { Show, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

export default function BannedBanner(props) {
  const { t } = useApp();
  const any = createMemo(() => !!(props.banned || props.authorBanned));

  return (
    <Show when={any()}>
      <div class="mb-3 rounded-md border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))] px-3 py-2 flex items-center gap-2">
        <svg viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor" aria-hidden="true">
          <path d="M11.001 10h2v5h-2zM11 16h2v2h-2z"/><path d="M1 21h22L12 2 1 21z"/>
        </svg>
        <div class="text-xs sm:text-sm font-semibold">
          {props.banned && props.authorBanned
            ? `${t("post.bannedPost")} • ${t("post.bannedAuthor")}`
            : props.banned
              ? t("post.bannedPost")
              : t("post.bannedAuthor")}
        </div>
      </div>
    </Show>
  );
}
