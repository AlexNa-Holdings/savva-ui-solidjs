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

// Dispatch to AdminActionsBridge → shows confirm dialog, then sends on-chain command
function dispatchAdminAction(action, detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent("savva:admin-action", { detail: { action, ...detail } }));
  } catch {}
}

/**
 * Build admin items for a post.
 * Visible only if caller gates by admin role in the UI.
 */
export function getPostAdminItems(post, t) {
  if (!post) return [];

  const savvaCid =
    post.savva_cid || post.savvaCID || post.id || post._raw?.savva_cid || post._raw?.id || "";

  const descriptorPathRaw = String(post.finalDescriptorPath || post.ipfs || "");
  const descriptorPath = descriptorPathRaw
    ? isProbablyCid(descriptorPathRaw)
      ? `${descriptorPathRaw}/info.yaml`
      : descriptorPathRaw
    : "";

  const dataCid = getPostContentBaseCid(post);
  const authorAddr = post.author?.address || post._raw?.author?.address || "";

  const items = [
    // Admin actions → confirm dialog (AdminActionsBridge) → ContentRegistry.command(...)
    {
      label: t("postcard.banPost"),
      onClick: () => dispatchAdminAction("ban-post", { savva_cid: savvaCid, author: authorAddr, post }),
    },
    {
      label: t("postcard.banUser"),
      onClick: () => dispatchAdminAction("ban-user", { author: authorAddr, savva_cid: savvaCid, post }),
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
