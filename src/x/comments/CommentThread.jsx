// src/x/comments/CommentThread.jsx
import { Show, createMemo, createEffect, createSignal } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { navigate } from "../../routing/hashRouter.js";
import CommentCard from "../post/CommentCard.jsx";
import { canDecryptPost, decryptPostMetadata } from "../crypto/postDecryption.js";

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

  const [decryptedParentPost, setDecryptedParentPost] = createSignal(null);
  const [fullParentPost, setFullParentPost] = createSignal(null);

  const isParentEncrypted = createMemo(() => {
    const parent = parentPost();

    // Check explicit encrypted flag
    if (parent?.encrypted) return true;

    // Fallback: detect encryption from title format (nonce:ciphertext pattern)
    // Encrypted titles are hex strings with : separator, typically >40 chars
    const locales = parent?.locales;
    if (locales) {
      for (const lang in locales) {
        const title = locales[lang]?.title;
        if (title && typeof title === 'string' && title.includes(':') && title.length > 40) {
          return true;
        }
      }
    }

    return false;
  });

  const userAddress = createMemo(() => app.authorizedUser()?.address);

  // Fetch full parent post if encrypted (to get encryption metadata)
  createEffect(async () => {
    const parent = parentPost();
    if (!parent || !isParentEncrypted() || fullParentPost()) return;

    // If parent doesn't have encryption data, fetch the full post
    if (!parent.encryption && !parent.savva_content?.encryption) {
      try {
        const contentList = app.wsMethod?.("content-list");
        if (!contentList) return;

        const savvaCid = parent.savva_cid;
        if (!savvaCid) return;

        const result = await contentList({
          domain: app.selectedDomainName?.() || "",
          savva_cid: savvaCid,
          limit: 1,
        });

        if (result?.list?.[0]) {
          setFullParentPost(result.list[0]);
        }
      } catch (error) {
        console.error("[CommentThread] Failed to fetch full parent post:", error);
      }
    }
  });

  const canDecryptParent = createMemo(() => {
    if (!isParentEncrypted()) return false;
    const addr = userAddress();
    if (!addr) return false;

    // Use full parent post if available, otherwise use the partial one
    const parent = fullParentPost() || parentPost();
    const encData = parent?.savva_content?.encryption || parent?.encryption;
    if (!encData) return false;

    return canDecryptPost(addr, encData);
  });

  // Auto-decrypt parent post if possible
  createEffect(async () => {
    if (!isParentEncrypted() || decryptedParentPost()) return;
    if (!canDecryptParent()) return;

    try {
      const addr = userAddress();
      const parent = fullParentPost() || parentPost();
      const decrypted = await decryptPostMetadata(parent, addr);
      setDecryptedParentPost(decrypted);
    } catch (error) {
      console.error("[CommentThread] Failed to decrypt parent post:", error);
    }
  });

  const parentTitle = createMemo(() => {
    const decrypted = decryptedParentPost();
    const parent = parentPost();

    // Use decrypted data if available
    let locales;
    if (decrypted) {
      locales = decrypted.savva_content?.locales || decrypted.content?.locales;
    } else {
      locales = parent?.locales;
    }

    const title = getLocalizedTitle(locales, lang());

    // If encrypted but title looks like ciphertext, show "Encrypted Content"
    if (isParentEncrypted() && title && title.includes(':') && title.length > 40) {
      return t("post.encrypted.title") || "Encrypted Content";
    }

    // If title is empty and parent is encrypted, show "Encrypted Content"
    return title || (isParentEncrypted() ? t("post.encrypted.title") || "Encrypted Content" : "");
  });

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