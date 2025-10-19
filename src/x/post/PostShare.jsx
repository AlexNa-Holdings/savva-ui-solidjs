// src/x/post/PostShare.jsx
import { Show, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { TelegramIcon, XIcon, FacebookIcon } from "../ui/icons/SocialIcons.jsx";

export default function PostShare(props) {
  const app = useApp();
  const { t } = app;

  const postUrl = createMemo(() => {
    if (typeof window === "undefined") return "";

    const post = props.post;
    if (!post) return "";

    const id = post.short_cid || post.savva_cid || post.id;
    if (!id) return "";

    // Get current language
    const currentLang = props.currentLang || "";

    // Check if post has multiple languages
    const locales = post.savva_content?.locales || post.content?.locales || {};
    const localeCount = Object.keys(locales).length;

    // Build the full URL without hash for shareable links
    const baseUrl = window.location.origin;
    const langParam = (localeCount > 1 && currentLang) ? `?lang=${currentLang}` : "";

    return `${baseUrl}/post/${id}${langParam}`;
  });

  const encodedUrl = createMemo(() => encodeURIComponent(postUrl()));

  const postTitle = createMemo(() => {
    const post = props.post;
    if (!post) return "";

    const currentLang = props.currentLang || app.lang?.() || "en";
    const contentLocales = post.savva_content?.locales || post.content?.locales;
    const title = contentLocales?.[currentLang]?.title || "";

    return title || t("post.share.defaultTitle") || "Check out this post";
  });

  const encodedTitle = createMemo(() => encodeURIComponent(postTitle()));

  const shareLinks = createMemo(() => ({
    telegram: `https://t.me/share/url?url=${encodedUrl()}&text=${encodedTitle()}`,
    twitter: `https://twitter.com/intent/tweet?url=${encodedUrl()}&text=${encodedTitle()}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl()}`
  }));

  const handleShare = (platform) => {
    const link = shareLinks()[platform];
    if (link) {
      window.open(link, "_blank", "noopener,noreferrer,width=600,height=400");
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(postUrl());
      app.pushToast?.({
        type: "success",
        message: t("post.share.linkCopied") || "Link copied to clipboard"
      });
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <Show when={props.post}>
      <div class="p-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
        <h3 class="text-sm font-semibold mb-3">
          {t("post.share.title") || "Share"}
        </h3>

        <div class="flex items-center gap-3">
          <button
            onClick={() => handleShare("telegram")}
            class="flex-1 flex items-center justify-center p-2 rounded-md bg-[hsl(var(--muted))] hover:bg-[hsl(var(--accent))] transition-colors"
            title="Share on Telegram"
          >
            <TelegramIcon class="w-5 h-5" />
          </button>

          <button
            onClick={() => handleShare("twitter")}
            class="flex-1 flex items-center justify-center p-2 rounded-md bg-[hsl(var(--muted))] hover:bg-[hsl(var(--accent))] transition-colors"
            title="Share on X (Twitter)"
          >
            <XIcon class="w-5 h-5 text-[hsl(var(--foreground))]" />
          </button>

          <button
            onClick={() => handleShare("facebook")}
            class="flex-1 flex items-center justify-center p-2 rounded-md bg-[hsl(var(--muted))] hover:bg-[hsl(var(--accent))] transition-colors"
            title="Share on Facebook"
          >
            <FacebookIcon class="w-5 h-5" />
          </button>
        </div>

        <button
          onClick={handleCopyLink}
          class="w-full mt-3 px-3 py-2 text-sm rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--muted))] transition-colors"
        >
          {t("post.share.copyLink") || "Copy Link"}
        </button>
      </div>
    </Show>
  );
}
