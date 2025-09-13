// src/x/ui/contextMenuBuilder.js
import { pushToast } from "./toast.js";
import { getPostContentBaseCid } from "../ipfs/utils.js";

// Clipboard helper
function copyToClipboard(text, label, t) {
  if (!text) return;
  navigator.clipboard
    .writeText(text)
    .then(() => pushToast({ type: "success", message: t("clipboard.copied", { label }) }))
    .catch((err) => console.error(`Failed to copy ${label}:`, err));
}

// CID heuristics
function isProbablyCid(s) {
  if (typeof s !== "string") return false;
  if (s.startsWith("Qm") && s.length === 46) return true; // v0
  if (s.startsWith("bafy")) return true; // v1
  return false;
}

// Dispatch to AdminActionsBridge
export function dispatchAdminAction(action, detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent("savva:admin-action", { detail: { action, ...detail } }));
  } catch {}
}

/**
 * Build admin items for a post (Ban/Unban Post, Ban/Unban Author + utilities).
 */
export function getPostAdminItems(post, t) {
  if (!post) return [];

  const raw = post._raw || post;
  const savvaCid =
    raw.savva_cid || raw.savvaCID || raw.id || post.savva_cid || post.savvaCID || post.id || "";

  const descriptorPathRaw = String(raw.finalDescriptorPath || raw.ipfs || post.finalDescriptorPath || post.ipfs || "");
  const descriptorPath = descriptorPathRaw
    ? isProbablyCid(descriptorPathRaw)
      ? `${descriptorPathRaw}/info.yaml`
      : descriptorPathRaw
    : "";

  const dataCid = getPostContentBaseCid(raw) || getPostContentBaseCid(post);
  const authorAddr =
    raw.author?.address || post.author?.address || raw.author_address || post.author_address || "";

  const bannedPost = !!(raw.banned ?? post.banned);
  const bannedAuthor = !!((raw.author_banned ?? post.author_banned) || raw.author?.banned || post.author?.banned);

  const items = [
    // Post: Ban/Unban
    {
      label: bannedPost ? t("postcard.unbanPost") : t("postcard.banPost"),
      onClick: () =>
        dispatchAdminAction(bannedPost ? "unban-post" : "ban-post", {
          savva_cid: savvaCid,
          author: authorAddr,
          post,
        }),
    },

    // Author: Ban/Unban
    {
      label: bannedAuthor ? t("postcard.unbanUser") : t("postcard.banUser"),
      onClick: () =>
        dispatchAdminAction(bannedAuthor ? "unban-user" : "ban-user", {
          author: authorAddr,
          savva_cid: savvaCid,
          post,
        }),
    },

    // Utilities
    {
      label: t("postcard.copySavvaCid"),
      onClick: () => copyToClipboard(savvaCid, "SAVVA CID", t),
    },
    {
      label: t("postcard.copyDescriptorCid"),
      onClick: () => copyToClipboard(descriptorPath, "Descriptor Path", t),
    },
    {
      label: t("postcard.copyDataCid"),
      onClick: () => copyToClipboard(dataCid, "Data CID", t),
    },
  ];

  return items;
}

/** Optional pin/unpin items if you decide to use them */
export function getPinningItems(post, t) {
  if (!post) return [];
  if (post.pinned) {
    return [{ label: t("postcard.unpin"), onClick: () => console.log("Unpin clicked for:", post.savva_cid) }];
  }
  return [{ label: t("postcard.pin"), onClick: () => console.log("Pin clicked for:", post.savva_cid) }];
}
