// src/components/comments/CommentThread.jsx
import { Show, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { navigate } from "../../routing/hashRouter.js";
import CommentCard from "../post/CommentCard.jsx";

// Helper to get the best-matching title from a post's locales object
function getLocalizedTitle(locales, lang) {
  if (!locales) return "";
  const l = locales[lang] || locales.en || locales[Object.keys(locales)[0]];
  return l?.title || "";
}

export default function CommentThread(props) {
  const app = useApp();
  const { t, lang } = app;

  const thread = () => props.thread?._raw;
  const parentPost = () => thread()?.savva_content?.parent_post;

  const parentTitle = createMemo(() => getLocalizedTitle(parentPost()?.locales, lang()));
  const parentAuthorName = createMemo(() => parentPost()?.author?.name || "anonymous");
  const parentPostUrl = createMemo(() => `/post/${parentPost()?.savva_cid}`);

  const handleNav = (e) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(parentPostUrl());
  };

  return (
    <div class="space-y-2 p-3 rounded-lg border border-[hsl(var(--border))] bg-opacity-50">
      <Show when={parentPost()}>
        <div class="text-xs text-[hsl(var(--muted-foreground))] px-3">
          <span>{t("commentsTab.replyTo")} </span>
          <a href={parentPostUrl()} onClick={handleNav} class="font-semibold text-[hsl(var(--foreground))] hover:underline">
            "{parentTitle()}"
          </a>
        </div>
      </Show>
      <CommentCard comment={thread()} />
    </div>
  );
}