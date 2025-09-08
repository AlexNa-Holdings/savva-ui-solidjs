// src/ui/contextMenuBuilder.js
import { pushToast } from "../ui/toast.js";
import { getPostDescriptorPath, getPostContentBaseCid } from "../ipfs/utils.js";

// A helper to avoid rewriting the clipboard logic everywhere
function copyToClipboard(text, label, t) {
  if (!text) return;
  navigator.clipboard
    .writeText(text)
    .then(() => {
      pushToast({ type: "success", message: t("clipboard.copied", { label }) });
    })
    .catch((err) => {
      console.error(`Failed to copy ${label}:`, err);
    });
}

// Normalize descriptor path for legacy posts (bare CID → <cid>/info.yaml)
function isProbablyCid(s) {
  if (typeof s !== "string") return false;
  if (s.startsWith("Qm") && s.length === 46) return true; // v0
  if (s.startsWith("bafy")) return true; // v1
  return false;
}
function normalizeDescriptorCopyPath(post) {
  const path = getPostDescriptorPath(post);
  if (!path) return path;
  const clean = String(path).replace(/^\/+|\/+$/g, "");
  const endsWithYaml = /(^|\/)info\.ya?ml$/i.test(clean);
  if (endsWithYaml) return clean;
  const first = clean.split("/")[0].replace(/^ipfs\//, "");
  if (isProbablyCid(first)) return `${first}/info.yaml`;
  return clean;
}

/**
 * Returns a standard set of admin menu items for a given post.
 * @param {object} post - The raw post object.
 * @param {function} t - The translation function from i18n.
 * @returns {Array<object>} An array of menu item objects.
 */
export function getPostAdminItems(post, t) {
  if (!post) return [];

  const items = [];
  const savvaCid = post.savva_cid;
  const descriptorPath = normalizeDescriptorCopyPath(post);
  const dataCid = getPostContentBaseCid(post);

  if (savvaCid) {
    items.push({
      label: t("postcard.copySavvaCid"),
      onClick: () => copyToClipboard(savvaCid, "SAVVA CID", t),
    });
  }
  if (descriptorPath) {
    items.push({
      label: t("postcard.copyDescriptorCid"),
      onClick: () => copyToClipboard(descriptorPath, "Descriptor Path", t),
    });
  }
  if (dataCid) {
    items.push({
      label: t("postcard.copyDataCid"),
      onClick: () => copyToClipboard(dataCid, "Data CID", t),
    });
  }

  return items;
}

/**
 * Returns pinning/unpinning menu items for a post.
 * @param {object} post - The raw post object.
 * @param {function} t - The translation function from i18n.
 * @returns {Array<object>} An array containing a single pin/unpin menu item, or an empty array.
 */
export function getPinningItems(post, t) {
  if (!post) return [];

  if (post.pinned) {
    return [
      {
        label: t("postcard.unpin"),
        onClick: () => console.log("Unpin clicked for:", post.savva_cid),
      },
    ];
  } else {
    return [
      {
        label: t("postcard.pin"),
        onClick: () => console.log("Pin clicked for:", post.savva_cid),
      },
    ];
  }
}
