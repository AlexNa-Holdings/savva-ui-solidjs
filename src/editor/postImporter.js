// src/editor/postImporter.js
import { dbg } from "../utils/debug.js";
import { ipfs } from "../ipfs/index.js";
import { parse, stringify } from "yaml";
import { DRAFT_DIRS, clearDraft, writeFile } from "./storage.js";
import { createTextPreview } from "./preview-utils.js";
import { getPostContentBaseCid } from "../ipfs/utils.js";
import { fetchDescriptorWithFallback } from "../ipfs/fetchDescriptorWithFallback.js";
// reuse our robust remote directory scanner (already used in admin domain-config)
import { discoverEntriesOrThrow } from "../x/pages/admin/domain_config/remoteScan.js";
import { decryptFileData } from "../x/crypto/fileEncryption.js";
import { getReadingSecretKey, decryptPostEncryptionKey, decryptLocale } from "../x/crypto/postDecryption.js";
import { swManager } from "../x/crypto/serviceWorkerManager.js";
import { formatUnits } from "viem";

const UPLOADS_PREFIX = "uploads/";

/**
 * Normalize any path that might come from descriptor/markdown so that
 * we always fetch via "CID/<relative>" without accidentally creating
 * malformed URLs.
 */
function normalizeRelativePath(p, contentBaseCid) {
  let s = p || "";
  if (!s) return "";

  // Strip ipfs://
  s = s.replace(/^ipfs:\/\//i, "");

  // Strip any gateway prefix like https://<gw>/ipfs/<cid>/
  s = s.replace(/^https?:\/\/[^/]+\/ipfs\/[^/]+\/?/i, "");

  // If the string accidentally already starts with the same CID, drop it
  if (contentBaseCid && s.startsWith(contentBaseCid + "/")) {
    s = s.slice(contentBaseCid.length + 1);
  }

  // Remove any leading slashes
  s = s.replace(/^\/+/, "");

  return s;
}

/**
 * Join CID + relative path safely (relative path should already be normalized).
 */
function joinCidPath(cid, rel) {
  if (!cid) return "";
  const r = (rel || "").replace(/^\/+/, "");
  return `${cid}/${r}`;
}

/**
 * Fetch a file given a post and a relative path under its content CID.
 * relativePath can be messy (gateway URL, ipfs://, leading slash, or include the CID) — we normalize it.
 * If the post is encrypted, automatically decrypts the file.
 */
async function fetchFile(app, post, descriptor, relativePath, postSecretKey = null) {
  const contentBaseCid = getPostContentBaseCid(post);
  if (!contentBaseCid || !relativePath) return null;

  const postGateways = descriptor?.gateways || [];
  const rel = normalizeRelativePath(relativePath, contentBaseCid);
  if (!rel) return null;

  const fullPath = joinCidPath(contentBaseCid, rel);
  const encodedPath = encodeURI(fullPath);
  dbg.log("Importer", "Fetching file from IPFS", {
    cid: contentBaseCid,
    relPath: rel,
    encrypted: !!postSecretKey,
  });
  const { res } = await ipfs.fetchBest(app, encodedPath, { postGateways });

  // If post is encrypted and we have the key, decrypt the file
  if (postSecretKey) {
    try {
      const encryptedData = await res.arrayBuffer();
      const decryptedData = decryptFileData(encryptedData, postSecretKey);
      dbg.log("Importer", "File decrypted successfully", { relPath: rel, byteLength: decryptedData.byteLength });
      return new Blob([decryptedData]);
    } catch (error) {
      dbg.warn("Importer", `Failed to decrypt file: ${relativePath}`, error);
      throw error;
    }
  }

  dbg.log("Importer", "Fetched plaintext file", { relPath: rel });
  return res.blob();
}

/** Helper to fetch a post object by its full Savva CID */
async function fetchPostObject(app, savva_cid) {
  if (!app.wsMethod || !savva_cid) return null;
  const contentList = app.wsMethod("content-list");
  const requestParams = {
    domain: app.selectedDomainName(),
    savva_cid: savva_cid,
    limit: 1,
  };
  const res = await contentList(requestParams);
  const arr = Array.isArray(res)
    ? res
    : Array.isArray(res?.list)
      ? res.list
      : [];
  return arr[0] || null;
}

/**
 * Import ALL files under the 'uploads/' directory for a post's content CID.
 * Preserves the directory structure (no flattening), so markdown references keep working.
 */
async function importAllUploads(app, descriptor, sourcePost, targetDirHandle, postSecretKey = null) {
  const contentBaseCid = getPostContentBaseCid(sourcePost);
  if (!contentBaseCid) return;

  const postGateways = descriptor?.gateways || [];
  let gateway = "";
  try {
    // Probe a working gateway that can list the CID root
    const { gateway: gw } = await ipfs.fetchBest(app, `${contentBaseCid}/`, { postGateways });
    gateway = gw;
  } catch {
    const sys = app.remoteIpfsGateways?.() || [];
    gateway = postGateways[0] || sys[0] || "https://ipfs.io/";
  }

  const prefixUrl = ipfs.buildUrl(gateway, contentBaseCid).replace(/\/+$/, "") + "/";
  let relFiles = [];
  try {
    // Discover entries relative to `prefixUrl`, scoped to uploads/
    relFiles = await discoverEntriesOrThrow(prefixUrl, UPLOADS_PREFIX);
  } catch (e) {
    dbg.warn("Importer", "uploads scan failed", { prefixUrl, error: String(e) });
    return;
  }

  if (!Array.isArray(relFiles) || relFiles.length === 0) {
    dbg.log("Importer", "uploads scan returned 0 files", { prefixUrl });
    return;
  }

  // Only files (no trailing slash), keep under 'uploads/...'
  const seen = new Set();
  for (const rel of relFiles) {
    if (!rel || !rel.startsWith(UPLOADS_PREFIX) || /\/$/.test(rel)) continue; // skip dirs

    // Normalize (defensive), dedupe by full relative path
    const normRel = normalizeRelativePath(rel, contentBaseCid);
    if (!normRel.startsWith(UPLOADS_PREFIX)) continue;
    if (seen.has(normRel)) continue;
    seen.add(normRel);

    try {
      const blob = await fetchFile(app, sourcePost, descriptor, normRel, postSecretKey);
      if (blob) {
        // Preserve full path under the draft root (e.g., 'uploads/foo/bar.png')
        await writeFile(targetDirHandle, normRel, blob);
        dbg.log("Importer", `Imported upload: ${normRel} (${blob.size || 0} bytes)`);
      }
    } catch (e) {
      dbg.warn("Importer", `Failed to import upload '${normRel}'`, e);
    }
  }
}

/**
 * Prepares a published post for editing by fetching its contents and
 * writing them to the local 'post' draft directory.
 * @param {object} post - The raw post object from the backend.
 * @param {object} app - The main app context.
 * @returns {Promise<void>}
 */
export async function preparePostForEditing(post, app) {
  const baseDir = DRAFT_DIRS.EDIT;
  dbg.log("Importer", `Preparing post for editing: ${post.savva_cid}`);

  // Clear any existing Service Worker encryption context for this post
  // This ensures the SW doesn't interfere with our manual decryption during import
  const contentBaseCid = getPostContentBaseCid(post);
  if (contentBaseCid) {
    await swManager.clearEncryptionContext(contentBaseCid);
    dbg.log("Importer", `Cleared SW encryption context for CID: ${contentBaseCid}`);
  }

  // Check if post is encrypted and decrypt the post key using the author's reading key
  let postSecretKey = null;
  const encryptionData =
    post?.encryption_data ||
    post?.savva_content?.encryption ||
    post?.content?.encryption ||
    null;
  dbg.log("Importer", "Encryption block inspection", {
    hasEncryptionData: !!encryptionData,
    hasRecipients: Array.isArray(encryptionData?.recipients)
      ? encryptionData.recipients.length
      : Object.keys(encryptionData?.recipients || {}).length,
  });

  if (encryptionData) {
    try {
      const actorAddress = app.actorAddress?.();
      const authorizedAddress = app.authorizedUser?.()?.address;
      const userAddress = authorizedAddress || actorAddress;
      dbg.log("Importer", "Resolved addresses for decrypting", {
        authorizedAddress,
        actorAddress,
        using: userAddress,
      });
      if (!userAddress) {
        throw new Error("Cannot edit encrypted post: user address not found");
      }

      // Get the reading secret key for the author
      const readingKeyNonce = encryptionData.reading_key_nonce;
      if (!readingKeyNonce) {
        throw new Error("Missing reading_key_nonce in encryption_data");
      }
      dbg.log("Importer", "Reading key nonce ready", { readingKeyNonce });

      const readingSecretKey = await getReadingSecretKey(userAddress, readingKeyNonce);
      if (!readingSecretKey) {
        throw new Error("Failed to get reading secret key");
      }
      dbg.log("Importer", "Reading secret key retrieved", { hasKey: true });

      // Decrypt the post encryption key using the reading key
      postSecretKey = decryptPostEncryptionKey(encryptionData, readingSecretKey);
      dbg.log("Importer", "Post is encrypted, successfully decrypted post key using reading key");
    } catch (error) {
      dbg.warn("Importer", `Failed to decrypt post key:`, error);
      throw new Error("Cannot edit encrypted post: " + error.message);
    }
  }

  await clearDraft(baseDir);
  const dirHandle = await navigator.storage
    .getDirectory()
    .then((root) => root.getDirectoryHandle(baseDir, { create: true }));

  const isComment = !!post.parent_savva_cid;
  let fileSourceObject = post;

  // For comments, use the root post's content as the file source for shared assets.
  if (isComment) {
    const rootCid = post.root_savva_cid || post.parent_savva_cid;
    if (rootCid) {
      dbg.log("Importer", `Comment detected. Fetching root post for files: ${rootCid}`);
      const rootPost = await fetchPostObject(app, rootCid);
      if (rootPost) {
        fileSourceObject = rootPost;
        dbg.log("Importer", "Root post resolved for comment assets", { rootCid });
      } else {
        dbg.warn("Importer", "Could not fetch root post, file import will be limited to comment.");
      }
    }
  }

  const { descriptor } = await fetchDescriptorWithFallback(app, post);
  if (!descriptor) return;

  // Import ALL assets from uploads/ (single source of truth)
  await importAllUploads(app, descriptor, fileSourceObject, dirHandle, postSecretKey);

  dbg.log("Importer", "Parsed descriptor:", descriptor);

  // Build local descriptor + params and download markdown/chapter files unchanged
  const supportedLangs = (app.domainAssetsConfig()?.locales || []).map((l) => l.code);
  const finalParams = {
    guid: post.guid,
    originalSavvaCid: post.savva_cid,
    nsfw: descriptor.nsfw || false,
    fundraiser: descriptor.fundraiser || 0,
    publishAsNewPost: false,
    locales: {},
    thumbnail: descriptor.thumbnail || null,
  };
  if (descriptor.parent_savva_cid) finalParams.parent_savva_cid = descriptor.parent_savva_cid;
  if (descriptor.root_savva_cid) finalParams.root_savva_cid = descriptor.root_savva_cid;

  // Parse audience-related params from descriptor and encryption data
  // Check descriptor first, then encryption block for access control settings
  const recipientListType = descriptor.recipient_list_type;
  if (recipientListType) {
    finalParams.audience = recipientListType;
    dbg.log("Importer", "Parsed audience from descriptor", { audience: recipientListType });
  }

  // Parse min weekly payment (check descriptor and encryption block)
  const minWeeklyFromDescriptor = descriptor.recipient_list_min_weekly;
  const minWeeklyFromEncryption = encryptionData?.min_weekly_pay;
  const minWeeklyValue = minWeeklyFromDescriptor || minWeeklyFromEncryption;
  if (minWeeklyValue) {
    try {
      finalParams.minWeeklyPaymentWei = BigInt(minWeeklyValue);
      // Also set the human-readable text value (assuming 18 decimals)
      finalParams.minWeeklyPayment = formatUnits(finalParams.minWeeklyPaymentWei, 18);
      dbg.log("Importer", "Parsed minWeeklyPayment", { wei: minWeeklyValue, text: finalParams.minWeeklyPayment });
    } catch (e) {
      dbg.warn("Importer", "Failed to parse minWeeklyPaymentWei", { value: minWeeklyValue, error: e });
    }
  }

  // Parse purchase access settings from encryption block only
  if (encryptionData?.allow_purchase) {
    finalParams.allowPurchase = true;
    dbg.log("Importer", "Parsed allowPurchase", { value: true });
  }

  const purchasePriceValue = encryptionData?.purchase_price;
  if (purchasePriceValue) {
    try {
      finalParams.purchasePriceWei = BigInt(purchasePriceValue);
      // Also set the human-readable text value (assuming 18 decimals)
      finalParams.purchasePrice = formatUnits(finalParams.purchasePriceWei, 18);
      dbg.log("Importer", "Parsed purchasePrice", { wei: purchasePriceValue, text: finalParams.purchasePrice });
    } catch (e) {
      dbg.warn("Importer", "Failed to parse purchasePriceWei", { value: purchasePriceValue, error: e });
    }
  }

  const finalDescriptor = {
    savva_spec_version: descriptor.savva_spec_version || "2.0",
    data_cid: getPostContentBaseCid(post),
    locales: {},
  };

  for (const lang of supportedLangs) {
    if (!descriptor.locales?.[lang]) continue;
    dbg.log("Importer", `Processing lang: ${lang}`);

    let localeDesc = descriptor.locales[lang];
    dbg.log("Importer", `Original locale for lang: ${lang}`, {
      title: localeDesc.title?.substring(0, 50),
      hasPostKey: !!postSecretKey
    });

    // Decrypt locale fields if post is encrypted
    if (postSecretKey) {
      localeDesc = decryptLocale(localeDesc, postSecretKey);
      dbg.log("Importer", `Decrypted locale for lang: ${lang}`, { title: localeDesc.title });
    }

    finalParams.locales[lang] = {
      tags: localeDesc.tags || [],
      categories: localeDesc.categories || [],
      chapters: [],
    };
    finalDescriptor.locales[lang] = {
      title: localeDesc.title,
      text_preview: createTextPreview(localeDesc.body || ""),
      data_path: `${lang}/data.md`,
      chapters: [],
    };

    // Fetch body & chapters from the *current* post object
    if (localeDesc.data_path) {
      dbg.log("Importer", "Fetching locale body", { lang, path: localeDesc.data_path });
      const bodyBlob = await fetchFile(app, post, descriptor, localeDesc.data_path, postSecretKey);
      if (bodyBlob) {
        await writeFile(dirHandle, `${lang}/data.md`, bodyBlob);
        dbg.log("Importer", `Wrote file: ${lang}/data.md, size: ${bodyBlob.size}`);
      }
    }

    if (Array.isArray(localeDesc.chapters)) {
      for (let i = 0; i < localeDesc.chapters.length; i++) {
        const ch = localeDesc.chapters[i];
        if (!ch?.data_path) continue;
        dbg.log("Importer", "Fetching chapter", { lang, index: i + 1, path: ch.data_path });
        const chBlob = await fetchFile(app, post, descriptor, ch.data_path, postSecretKey);
        if (chBlob) {
          await writeFile(dirHandle, `${lang}/chapters/${i + 1}.md`, chBlob);
          dbg.log("Importer", `Wrote chapter: ${lang}/chapters/${i + 1}.md, size: ${chBlob.size}`);
          finalParams.locales[lang].chapters.push({ title: ch.title || "" });
          finalDescriptor.locales[lang].chapters.push({ data_path: `${lang}/chapters/${i + 1}.md` });
        }
      }
    }
  }

  // Ensure thumbnail is materialized locally and points to the preserved uploads path
  if (finalParams.thumbnail) {
    const srcCidOwner = getPostContentBaseCid(fileSourceObject);
    const normalizedThumbRel = normalizeRelativePath(finalParams.thumbnail, srcCidOwner);
    try {
      dbg.log("Importer", "Fetching thumbnail", {
        original: finalParams.thumbnail,
        normalized: normalizedThumbRel,
        sourceCid: srcCidOwner,
      });
      const thumbBlob = await fetchFile(app, fileSourceObject, descriptor, normalizedThumbRel, postSecretKey);
      if (thumbBlob) {
        // Write to the exact relative path (e.g., 'uploads/...'), not a flattened name
        const localThumbPath = normalizedThumbRel.startsWith(UPLOADS_PREFIX)
          ? normalizedThumbRel
          : `${DRAFT_DIRS.UPLOADS}/${normalizedThumbRel.split("/").pop()}`;

        await writeFile(dirHandle, localThumbPath, thumbBlob);
        finalParams.thumbnail = localThumbPath;

        dbg.log("Importer", `Wrote thumbnail: ${localThumbPath}, size: ${thumbBlob.size}`);
      }
    } catch (e) {
      dbg.warn("Importer", `Failed to import thumbnail: ${finalParams.thumbnail}`, e);
    }
  }

  dbg.log("Importer:finalParams", "Params being saved to draft:", finalParams);

  // Convert BigInt values to strings before JSON serialization
  const serializableParams = { ...finalParams };
  if (serializableParams.minWeeklyPaymentWei) {
    serializableParams.minWeeklyPaymentWei = serializableParams.minWeeklyPaymentWei.toString();
  }
  if (serializableParams.purchasePriceWei) {
    serializableParams.purchasePriceWei = serializableParams.purchasePriceWei.toString();
  }

  await writeFile(dirHandle, "info.yaml", stringify(finalDescriptor));
  await writeFile(dirHandle, "params.json", JSON.stringify(serializableParams, null, 2));

  dbg.log("Importer", "Post successfully imported for editing.");
}
