// src/editor/postImporter.js
import { dbg } from "../utils/debug.js";
import { ipfs } from "../ipfs/index.js";
import { parse, stringify } from "yaml";
import { DRAFT_DIRS, clearDraft, writeFile } from "./storage.js";
import { createTextPreview } from "./preview-utils.js";
import { getPostDescriptorPath, getPostContentBaseCid } from "../ipfs/utils.js";

async function fetchFile(app, post, descriptor, relativePath) {
  const contentBaseCid = getPostContentBaseCid(post);
  if (!contentBaseCid || !relativePath) return null;

  const fullPath = `${contentBaseCid}/${relativePath}`;
  dbg.log("Importer", `Fetching file at full path: ${fullPath}`);
  const postGateways = descriptor?.gateways || [];
  const { res } = await ipfs.fetchBest(app, fullPath, { postGateways });
  return res.blob();
}

// Helper to fetch a post object by its full Savva CID
async function fetchPostObject(app, savva_cid) {
  if (!app.wsMethod || !savva_cid) return null;
  const contentList = app.wsMethod("content-list");
  const requestParams = {
    domain: app.selectedDomainName(),
    savva_cid: savva_cid,
    limit: 1,
  };
  const res = await contentList(requestParams);
  const arr = Array.isArray(res) ? res : Array.isArray(res?.list) ? res.list : [];
  return arr[0] || null;
}

// Helper to find all referenced files in a post and copy them to a draft directory
async function importReferencedFiles(app, sourcePost, targetDirHandle) {
  if (!sourcePost) return;

  const descriptorPath = getPostDescriptorPath(sourcePost);
  if (!descriptorPath) return;

  const { res: descriptorRes } = await ipfs.fetchBest(app, descriptorPath);
  const descriptor = parse(await descriptorRes.text());
  if (!descriptor) return;

  const contentBaseCid = getPostContentBaseCid(sourcePost);
  if (!contentBaseCid) return;

  const relativePaths = new Set();
  if (descriptor.thumbnail) {
    relativePaths.add(descriptor.thumbnail);
  }

  const markdownStrings = [];
  if (descriptor.locales) {
    for (const langCode in descriptor.locales) {
      const locale = descriptor.locales[langCode];
      if (locale.data_path) {
        try {
          const content = await ipfs.fetchBest(app, `${contentBaseCid}/${locale.data_path}`).then(r => r.res.text());
          markdownStrings.push(content);
        } catch (e) { dbg.warn("Importer", `Could not fetch markdown for file scan: ${locale.data_path}`, e); }
      }
      if (Array.isArray(locale.chapters)) {
        for (const chapter of locale.chapters) {
          if (chapter.data_path) {
            try {
              const content = await ipfs.fetchBest(app, `${contentBaseCid}/${chapter.data_path}`).then(r => r.res.text());
              markdownStrings.push(content);
            } catch (e) { dbg.warn("Importer", `Could not fetch chapter for file scan: ${chapter.data_path}`, e); }
          }
        }
      }
    }
  }

  const combinedMarkdown = markdownStrings.join('\n');
  const pathRegex = /(?:src=["']|url\(|href=["']|\()(?<path>uploads\/[^"')]+)/g;
  let match;
  while ((match = pathRegex.exec(combinedMarkdown)) !== null) {
    if (match.groups.path) {
      relativePaths.add(match.groups.path);
    }
  }

  dbg.log("Importer", "Found relative file paths to import:", Array.from(relativePaths));
  if (relativePaths.size === 0) return;
  
  const uploadsDirHandle = await targetDirHandle.getDirectoryHandle(DRAFT_DIRS.UPLOADS, { create: true });
  for (const relPath of relativePaths) {
    try {
      const blob = await fetchFile(app, sourcePost, descriptor, relPath);
      if (blob) {
        const fileName = relPath.split('/').pop();
        await writeFile(uploadsDirHandle, fileName, blob);
        dbg.log("Importer", `Imported file: ${fileName}`);
      }
    } catch (e) {
      dbg.warn("Importer", `Failed to import referenced file: ${relPath}`, e);
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

  if (isComment) {
    const rootCid = post.root_savva_cid || post.parent_savva_cid;
    if (rootCid) {
      dbg.log("Importer", `Comment detected. Fetching root post for files: ${rootCid}`);
      const rootPost = await fetchPostObject(app, rootCid);
      if (rootPost) {
        fileSourceObject = rootPost;
      } else {
        dbg.warn("Importer", "Could not fetch root post, file import will be skipped.");
      }
    }
  }

  await importReferencedFiles(app, fileSourceObject, dirHandle);

  const descriptorPath = getPostDescriptorPath(post);
  const { res: descriptorRes } = await ipfs.fetchBest(app, descriptorPath);
  const descriptorText = await descriptorRes.text();
  const descriptor = parse(descriptorText);
  if (!descriptor) throw new Error("Could not parse post descriptor.");
  dbg.log("Importer", "Parsed descriptor:", descriptor);

  const supportedLangs = (app.domainAssetsConfig()?.locales || []).map(
    (l) => l.code
  );
  const finalParams = {
    guid: post.guid,
    originalSavvaCid: post.savva_cid,
    nsfw: descriptor.nsfw || false,
    fundraiser: descriptor.fundraiser || 0,
    publishAsNewPost: false,
    locales: {},
    thumbnail: descriptor.thumbnail || null,
  };

  if (descriptor.parent_savva_cid) {
    finalParams.parent_savva_cid = descriptor.parent_savva_cid;
  }
  if (descriptor.root_savva_cid) {
    finalParams.root_savva_cid = descriptor.root_savva_cid;
  }

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

    const bodyBlob = await fetchFile(
      app,
      post,
      descriptor,
      localeDesc.data_path
    );
    if (bodyBlob) {
      await writeFile(dirHandle, `${lang}/data.md`, bodyBlob);
      dbg.log(
        "Importer",
        `Wrote file: ${lang}/data.md, size: ${bodyBlob.size}`
      );
    }

    if (Array.isArray(localeDesc.chapters)) {
      for (let i = 0; i < localeDesc.chapters.length; i++) {
        const chapter = localeDesc.chapters[i];
        finalParams.locales[lang].chapters.push({ title: chapter.title });
        const chapterPath = `${lang}/chapters/${i + 1}.md`;
        finalDescriptor.locales[lang].chapters.push({ data_path: chapterPath });
        const chapterBlob = await fetchFile(
          app,
          post,
          descriptor,
          chapter.data_path
        );
        if (chapterBlob) {
          await writeFile(dirHandle, chapterPath, chapterBlob);
          dbg.log(
            "Importer",
            `Wrote file: ${chapterPath}, size: ${chapterBlob.size}`
          );
        }
      }
    }
  }

  if (finalParams.thumbnail) {
    const thumbBlob = await fetchFile(
      app,
      post,
      descriptor,
      finalParams.thumbnail
    );
    if (thumbBlob) {
      const thumbName = finalParams.thumbnail.split("/").pop();
      const newThumbPath = `${DRAFT_DIRS.UPLOADS}/${thumbName}`;
      await writeFile(dirHandle, newThumbPath, thumbBlob);
      finalParams.thumbnail = newThumbPath;
      dbg.log(
        "Importer",
        `Wrote thumbnail: ${newThumbPath}, size: ${thumbBlob.size}`
      );
    }
  }

  dbg.log("Importer:finalParams", "Params being saved to draft:", finalParams);
  await writeFile(dirHandle, "info.yaml", stringify(finalDescriptor));
  await writeFile(
    dirHandle,
    "params.json",
    JSON.stringify(finalParams, null, 2)
  );

  dbg.log("Importer", "Post successfully imported for editing.");
}