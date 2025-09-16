// src/x/ui/contextMenuBuilder.js
import { pushToast } from "./toast.js";
import { getPostContentBaseCid } from "../ipfs/utils.js";
import { listRemovePost, listPinPost, listUnpinPost } from "../blockchain/adminCommands.js";
import { dbg } from "../utils/debug.js";

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
 * Build admin items for a post (Ban/Unban Post, Ban/Unban Author + utilities + Announce).
 * NOTE: "Announce…" is shown only for POSTS (no ParentSavvaCID).
 */
export function getPostAdminItems(post, t) {
  if (!post) return [];

  const raw = post._raw || post;

  const savvaCid =
    raw.savva_cid || raw.savvaCID || raw.id || post.savva_cid || post.savvaCID || post.id || "";

  // A "comment" has a ParentSavvaCID; a "post" does not (be liberal about casing/aliases).
  const isComment = !!(
    raw?.savva_content?.parent_savva_cid ??
    post?.savva_content?.parent_savva_cid );

  const descriptorPathRaw = String(
    raw.finalDescriptorPath || raw.ipfs || post.finalDescriptorPath || post.ipfs || ""
  );
  const descriptorPath = descriptorPathRaw
    ? isProbablyCid(descriptorPathRaw)
      ? `${descriptorPathRaw}/info.yaml`
      : descriptorPathRaw
    : "";

  const dataCid = getPostContentBaseCid(raw) || getPostContentBaseCid(post);
  const authorAddr =
    raw.author?.address || post.author?.address || raw.author_address || post.author_address || "";

  const bannedPost = !!(raw.banned ?? post.banned);
  const bannedAuthor = !!(
    (raw.author_banned ?? post.author_banned) || raw.author?.banned || post.author?.banned
  );

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
  ];

  // Posts only: Announce…
  if (!isComment) {
    items.push({
      label: t("admin.announce"),
      onClick: () =>
        dispatchAdminAction("announce-post", {
          savva_cid: savvaCid,
          author: authorAddr,
          post,
        }),
    });
  }

  // Utilities
  items.push(
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
    }
  );

  return items;
}

/**
 * Pin / Unpin / Remove-from-list actions for a post shown within a list context.
 * Usage: getPinningItems(post, app.t, { app, listId })
 */
export function getPinningItems(post, t, opts = {}) {
  if (!post) return [];

  const { app, listId: listIdOpt } = opts || {};
  const listId =
    listIdOpt ||
    post?.list_id ||
    post?.listId ||
    post?._context?.listId ||
    "";

  const savvaCid =
    post?.savva_cid ||
    post?.savvaCID ||
    post?.id ||
    post?._raw?.savva_cid ||
    post?._raw?.savvaCID ||
    post?._raw?.id ||
    "";

  const ensureCtx = () => {
    if (!app) {
      pushToast({ type: "error", message: t("postcard.errorNoApp") });
      return false;
    }
    if (!listId) {
      pushToast({ type: "error", message: t("postcard.errorNoListContext") });
      return false;
    }
    if (!savvaCid) {
      pushToast({ type: "error", message: t("postcard.errorNoPostId") });
      return false;
    }
    return true;
  };

  const onRemove = async () => {
    if (!ensureCtx()) return;
    try {
      await listRemovePost(app, { listId, savvaCid });
      pushToast({ type: "success", message: t("postcard.removedFromList") });
      try {
        window.dispatchEvent(
          new CustomEvent("savva:admin-action", {
            detail: { action: "list:removed", list_id: listId, savva_cid: savvaCid },
          })
        );
      } catch {}
    } catch (e) {
      dbg.error("listRemovePost failed", e);
      pushToast({
        type: "error",
        message: t("postcard.removeFailed"),
        details: { error: String(e?.message || e) },
        autohideMs: 12000,
      });
    }
  };

  const onPin = async () => {
    if (!ensureCtx()) return;
    try {
      await listPinPost(app, { listId, savvaCid });
      pushToast({ type: "success", message: t("postcard.pinned") });
      try {
        window.dispatchEvent(
          new CustomEvent("savva:admin-action", {
            detail: { action: "list:pinned", list_id: listId, savva_cid: savvaCid },
          })
        );
      } catch {}
    } catch (e) {
      dbg.error("listPinPost failed", e);
      pushToast({
        type: "error",
        message: t("postcard.pinFailed"),
        details: { error: String(e?.message || e) },
        autohideMs: 12000,
      });
    }
  };

  const onUnpin = async () => {
    if (!ensureCtx()) return;
    try {
      await listUnpinPost(app, { listId, savvaCid });
      pushToast({ type: "success", message: t("postcard.unpinned") });
      try {
        window.dispatchEvent(
          new CustomEvent("savva:admin-action", {
            detail: { action: "list:unpinned", list_id: listId, savva_cid: savvaCid },
          })
        );
      } catch {}
    } catch (e) {
      dbg.error("listUnpinPost failed", e);
      pushToast({
        type: "error",
        message: t("postcard.unpinFailed"),
        details: { error: String(e?.message || e) },
        autohideMs: 12000,
      });
    }
  };

  const items = [];

  if (post?.pinned) {
    items.push({ label: t("postcard.unpin"), onClick: onUnpin });
  } else {
    items.push({ label: t("postcard.pin"), onClick: onPin });
  }

  items.push({ label: t("postcard.removeFromList"), onClick: onRemove });

  return items;
}
