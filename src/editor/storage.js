// src/editor/storage.js
import { dbg } from "../utils/debug";
import { parse, stringify } from "yaml";

const NEW_POST_DIR = "new_post";
const UPLOAD_DIR = "uploads";
const PARAMS_FILE = "new_post.json";

async function getDirectoryHandle(path) {
  try {
    if (!navigator.storage || !navigator.storage.getDirectory) {
      dbg.warn("storage", "Origin Private File System API not available.");
      return null;
    }
    const root = await navigator.storage.getDirectory();
    let currentHandle = root;
    for (const part of path.split('/').filter(Boolean)) {
      currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
    }
    return currentHandle;
  } catch (e) {
    dbg.error("storage", `Failed to get directory handle for '${path}'`, e);
    throw e;
  }
}

async function readFile(dirHandle, path) {
  if (!dirHandle) return null;
  try {
    const pathParts = path.split('/').filter(Boolean);
    let currentHandle = dirHandle;
    for (let i = 0; i < pathParts.length - 1; i++) {
      currentHandle = await currentHandle.getDirectoryHandle(pathParts[i]);
    }
    const fileName = pathParts[pathParts.length - 1];
    const fileHandle = await currentHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch (e) {
    if (e.name === 'NotFoundError') return null;
    dbg.error("storage", `Failed to read file: ${path}`, e);
    throw e;
  }
}

async function writeFile(dirHandle, path, content) {
  if (!dirHandle) return;
  try {
    const pathParts = path.split('/').filter(Boolean);
    let currentHandle = dirHandle;
    for (let i = 0; i < pathParts.length - 1; i++) {
      currentHandle = await currentHandle.getDirectoryHandle(pathParts[i], { create: true });
    }
    const fileName = pathParts[pathParts.length - 1];
    const fileHandle = await currentHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  } catch (e) {
    dbg.error("storage", `Failed to write file: ${path}`, e);
    throw e;
  }
}

export async function listUploadedFiles() {
  const uploadsDirHandle = await getDirectoryHandle(`${NEW_POST_DIR}/${UPLOAD_DIR}`);
  if (!uploadsDirHandle) return [];
  
  const files = [];
  for await (const entry of uploadsDirHandle.values()) {
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      const url = URL.createObjectURL(file);
      files.push({ name: entry.name, url });
    }
  }
  return files;
}

export async function addUploadedFile(file) {
  const uploadsDirHandle = await getDirectoryHandle(`${NEW_POST_DIR}/${UPLOAD_DIR}`);
  await writeFile(uploadsDirHandle, file.name, file);
}

export async function addUploadedFileFromUrl(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const blob = await response.blob();
    const fileName = url.substring(url.lastIndexOf('/') + 1) || "downloaded_file";
    const file = new File([blob], fileName, { type: blob.type });
    await addUploadedFile(file);
    return file;
  } catch (error) {
    dbg.error("storage", "Failed to upload from URL", { url, error });
    throw error;
  }
}

export async function deleteUploadedFile(fileName) {
  try {
    const uploadsDirHandle = await getDirectoryHandle(`${NEW_POST_DIR}/${UPLOAD_DIR}`);
    if (!uploadsDirHandle) return;
    await uploadsDirHandle.removeEntry(fileName);
    dbg.log("storage", `Deleted file: ${fileName}`);
  } catch (error) {
    dbg.error("storage", `Failed to delete file: ${fileName}`, error);
    throw error;
  }
}

export async function resolveDraftFileUrl(relativePath) {
  if (!relativePath) return null;
  try {
    const dirHandle = await getDirectoryHandle(NEW_POST_DIR);
    const pathParts = relativePath.split('/').filter(Boolean);
    let currentHandle = dirHandle;
    for (let i = 0; i < pathParts.length - 1; i++) {
      currentHandle = await currentHandle.getDirectoryHandle(pathParts[i]);
    }
    const fileName = pathParts[pathParts.length - 1];
    const fileHandle = await currentHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return URL.createObjectURL(file);
  } catch (e) {
    if (e.name !== 'NotFoundError') {
      dbg.error("storage", `Failed to resolve draft file URL for ${relativePath}`, e);
    }
    return null;
  }
}

export async function loadNewPostDraft() {
  dbg.log("storage", "Loading new post draft...");
  const dirHandle = await getDirectoryHandle(NEW_POST_DIR);
  const descriptorYaml = await readFile(dirHandle, "info.yaml");
  const paramsJson = await readFile(dirHandle, PARAMS_FILE);

  const postData = {};
  const params = paramsJson ? JSON.parse(paramsJson) : {};

  if (descriptorYaml) {
    const descriptor = parse(descriptorYaml);
    for (const lang in descriptor.locales) {
      const localeData = descriptor.locales[lang];
      const chapterTitles = params.locales?.[lang]?.chapters || [];
      
      postData[lang] = { title: localeData.title || "", body: "", chapters: [] };
      
      if (localeData.data_path) {
        postData[lang].body = await readFile(dirHandle, localeData.data_path) || "";
      }
      
      if (Array.isArray(localeData.chapters)) {
        for (let i = 0; i < localeData.chapters.length; i++) {
          const chapterDesc = localeData.chapters[i];
          const chapterBody = await readFile(dirHandle, chapterDesc.data_path) || "";
          const chapterTitle = chapterTitles[i]?.title || "";
          postData[lang].chapters.push({ title: chapterTitle, body: chapterBody });
        }
      }
    }
  }

  const draft = {
    content: Object.keys(postData).length > 0 ? postData : { en: { title: "", body: "", chapters: [] } },
    params: params
  };

  if (!draft.content && !Object.keys(draft.params).length) {
    dbg.log("storage", "No draft found.");
    return null;
  }

  dbg.log("storage", "Draft loaded successfully.", draft);
  return draft;
}

export async function saveNewPostDraft(draftData) {
  dbg.log("storage", "Saving new post draft...", draftData);
  const dirHandle = await getDirectoryHandle(NEW_POST_DIR);
  
  const { content, params } = draftData;

  const finalParams = { ...params, locales: {} };

  const descriptor = {
    savva_spec_version: "2.0",
    mime_type: "text/markdown",
    locales: {}
  };

  if (content) {
    for (const lang in content) {
      const data = content[lang];
      const dataPath = `${lang}/data.md`;
      
      descriptor.locales[lang] = {
        title: data.title || "",
        text_preview: (data.body || "").substring(0, 200),
        data_path: dataPath,
        chapters: []
      };

      finalParams.locales[lang] = { chapters: [] };
      
      await writeFile(dirHandle, dataPath, data.body || "");

      if (Array.isArray(data.chapters)) {
        for (let i = 0; i < data.chapters.length; i++) {
          const chapter = data.chapters[i];
          const chapterPath = `${lang}/chapters/${i + 1}.md`;
          
          descriptor.locales[lang].chapters.push({ data_path: chapterPath });
          finalParams.locales[lang].chapters.push({ title: chapter.title });
          
          await writeFile(dirHandle, chapterPath, chapter.body || "");
        }
      }
    }
    await writeFile(dirHandle, "info.yaml", stringify(descriptor));
  }
  
  await writeFile(dirHandle, PARAMS_FILE, JSON.stringify(finalParams, null, 2));
  dbg.log("storage", "Draft saved successfully.");
}