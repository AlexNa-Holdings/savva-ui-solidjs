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
 */
async function fetchFile(app, post, descriptor, relativePath) {
  const contentBaseCid = getPostContentBaseCid(post);
  if (!contentBaseCid || !relativePath) return null;

  const postGateways = descriptor?.gateways || [];
  const rel = normalizeRelativePath(relativePath, contentBaseCid);
  if (!rel) return null;

  const fullPath = joinCidPath(contentBaseCid, rel);
  const encodedPath = encodeURI(fullPath);
  const { res } = await ipfs.fetchBest(app, encodedPath, { postGateways });
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
async function importAllUploads(app, descriptor, sourcePost, targetDirHandle) {
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
      const blob = await fetchFile(app, sourcePost, descriptor, normRel);
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
      } else {
        dbg.warn("Importer", "Could not fetch root post, file import will be limited to comment.");
      }
    }
  }

  const { descriptor } = await fetchDescriptorWithFallback(app, post);
  if (!descriptor) return;

  // Import ALL assets from uploads/ (single source of truth)
  await importAllUploads(app, descriptor, fileSourceObject, dirHandle);

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

  const finalDescriptor = {
    savva_spec_version: descriptor.savva_spec_version || "2.0",
    data_cid: getPostContentBaseCid(post),
    locales: {},
  };

  for (const lang of supportedLangs) {
    if (!descriptor.locales?.[lang]) continue;
    dbg.log("Importer", `Processing lang: ${lang}`);

    const localeDesc = descriptor.locales[lang];
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
      const bodyBlob = await fetchFile(app, post, descriptor, localeDesc.data_path);
      if (bodyBlob) {
        await writeFile(dirHandle, `${lang}/data.md`, bodyBlob);
        dbg.log("Importer", `Wrote file: ${lang}/data.md, size: ${bodyBlob.size}`);
      }
    }

    if (Array.isArray(localeDesc.chapters)) {
      for (let i = 0; i < localeDesc.chapters.length; i++) {
        const ch = localeDesc.chapters[i];
        if (!ch?.data_path) continue;
        const chBlob = await fetchFile(app, post, descriptor, ch.data_path);
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
      const thumbBlob = await fetchFile(app, fileSourceObject, descriptor, normalizedThumbRel);
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
  await writeFile(dirHandle, "info.yaml", stringify(finalDescriptor));
  await writeFile(dirHandle, "params.json", JSON.stringify(finalParams, null, 2));

  dbg.log("Importer", "Post successfully imported for editing.");
}
