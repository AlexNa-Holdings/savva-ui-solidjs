// src/editor/storage.js
import { dbg } from "../utils/debug";
import { parse, stringify } from "yaml";
import { createTextPreview } from "./preview-utils.js";

export const DRAFT_DIRS = {
  NEW_POST: "new_post",
  NEW_COMMENT: "new_comment",
  EDIT: "edit",
  UPLOADS: "uploads",
};
const PARAMS_FILE = "params.json";

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

export async function writeFile(dirHandle, path, content) {
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

export async function listUploadedFiles(baseDir) {
  const uploadsDirHandle = await getDirectoryHandle(`${baseDir}/${DRAFT_DIRS.UPLOADS}`);
  if (!uploadsDirHandle) return [];
  
  const files = [];
  for await (const entry of uploadsDirHandle.values()) {
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      const url = URL.createObjectURL(file);
      files.push({ name: entry.name, url, size: file.size });
    }
  }
  return files;
}

export async function addUploadedFile(baseDir, file) {
  const uploadsDirHandle = await getDirectoryHandle(`${baseDir}/${DRAFT_DIRS.UPLOADS}`);
  let filename = file.name
  filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  await writeFile(uploadsDirHandle, filename, file);
}

export async function addUploadedFileFromUrl(baseDir, url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const blob = await response.blob();
    
    let fileName;
    try {
      const decodedUrl = decodeURIComponent(url);
      const urlObj = new URL(decodedUrl);
      
      let name = urlObj.pathname.substring(urlObj.pathname.lastIndexOf('/') + 1);
      const filenameParam = urlObj.searchParams.get('filename');
      if (name && !name.includes('.') && filenameParam && filenameParam.startsWith('.')) {
        name += filenameParam;
      }
      fileName = (name || "downloaded_file").replace(/[^a-zA-Z0-9._-]/g, '_');

    } catch (e) {
      const decodedUrl = decodeURIComponent(url);
      const cleanUrl = decodedUrl.split('?')[0].split('#')[0];
      let name = cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1);
      fileName = (name || "downloaded_file").replace(/[^a-zA-Z0-9._-]/g, '_');
    }

    const file = new File([blob], fileName, { type: blob.type });
    await addUploadedFile(baseDir, file);
    return file;
  } catch (error) {
    dbg.error("storage", "Failed to upload from URL", { url, error });
    throw error;
  }
}

export async function deleteUploadedFile(baseDir, fileName) {
  try {
    const uploadsDirHandle = await getDirectoryHandle(`${baseDir}/${DRAFT_DIRS.UPLOADS}`);
    if (!uploadsDirHandle) return;
    await uploadsDirHandle.removeEntry(fileName);
    dbg.log("storage", `Deleted file: ${fileName} from ${baseDir}`);
  } catch (error) {
    dbg.error("storage", `Failed to delete file: ${fileName} from ${baseDir}`, error);
    throw error;
  }
}

export async function resolveDraftFileUrl(baseDir, relativePath) {
  if (!relativePath) return null;
  try {
    const dirHandle = await getDirectoryHandle(baseDir);
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
      dbg.error("storage", `Failed to resolve draft file URL for ${relativePath} in ${baseDir}`, e);
    }
    return null;
  }
}

export async function getAllUploadedFileNames(baseDir) {
  const uploadsDirHandle = await getDirectoryHandle(`${baseDir}/${DRAFT_DIRS.UPLOADS}`);
  if (!uploadsDirHandle) return [];
  
  const names = [];
  for await (const entry of uploadsDirHandle.values()) {
    if (entry.kind === 'file') {
      names.push(entry.name);
    }
  }
  return names;
}

export async function getUploadedFileAsFileObject(baseDir, fileName) {
  try {
    const uploadsDirHandle = await getDirectoryHandle(`${baseDir}/${DRAFT_DIRS.UPLOADS}`);
    if (!uploadsDirHandle) return null;
    
    const fileHandle = await uploadsDirHandle.getFileHandle(fileName);
    return await fileHandle.getFile();
  } catch (e) {
    if (e.name !== 'NotFoundError') {
      dbg.error("storage", `Failed to get File object for ${fileName} in ${baseDir}`, e);
    }
    return null;
  }
}

export async function loadDraft(baseDir) {
  dbg.log("storage", `Loading draft from '${baseDir}'...`);
  const dirHandle = await getDirectoryHandle(baseDir);
  const descriptorYaml = await readFile(dirHandle, "info.yaml");
  const paramsJson = await readFile(dirHandle, PARAMS_FILE);

  const postData = {};
  const params = paramsJson ? JSON.parse(paramsJson) : {};

  if (descriptorYaml) {
    const descriptor = parse(descriptorYaml);
    for (const lang in descriptor.locales) {
      const localeData = descriptor.locales[lang];
      postData[lang] = { title: localeData.title || "", body: "", chapters: [] };
      
      if (localeData.data_path) {
        postData[lang].body = await readFile(dirHandle, localeData.data_path) || "";
      }
      
      if (Array.isArray(localeData.chapters)) {
        for (let i = 0; i < localeData.chapters.length; i++) {
          const chapterDesc = localeData.chapters[i];
          const chapterBody = await readFile(dirHandle, chapterDesc.data_path) || "";
          postData[lang].chapters.push({ body: chapterBody });
        }
      }
    }
  }

  const draft = {
    content: Object.keys(postData).length > 0 ? postData : null,
    params: params
  };

  if (!draft.content && !Object.keys(draft.params).length) {
    dbg.log("storage", `No draft found in '${baseDir}'.`);
    return null;
  }

  dbg.log("storage", `Draft loaded successfully from '${baseDir}'.`, draft);
  return draft;
}

export async function getDraftParams(baseDir) {
  try {
    const dirHandle = await getDirectoryHandle(baseDir);
    const paramsJson = await readFile(dirHandle, PARAMS_FILE);
    return paramsJson ? JSON.parse(paramsJson) : null;
  } catch (e) {
    if (e.name !== 'NotFoundError') {
      dbg.error("storage", `Failed to get draft params from '${baseDir}'`, e);
    }
    return null;
  }
}

export async function saveDraft(baseDir, draftData) {
  dbg.log("storage", `Saving draft to '${baseDir}'...`, draftData);
  const dirHandle = await getDirectoryHandle(baseDir);
  
  const { content, params } = draftData;

  const finalParams = JSON.parse(JSON.stringify(params || {}));
  if (!finalParams.locales) finalParams.locales = {};

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
        text_preview: createTextPreview(data.body || ""),
        data_path: dataPath,
        chapters: []
      };

      if (!finalParams.locales[lang]) finalParams.locales[lang] = { chapters: [] };
      
      await writeFile(dirHandle, dataPath, data.body || "");

      if (Array.isArray(data.chapters)) {
        for (let i = 0; i < data.chapters.length; i++) {
          const chapterContent = data.chapters[i];
          const chapterPath = `${lang}/chapters/${i + 1}.md`;
          
          descriptor.locales[lang].chapters.push({ data_path: chapterPath });
          
          await writeFile(dirHandle, chapterPath, chapterContent.body || "");
        }
      }
    }
    await writeFile(dirHandle, "info.yaml", stringify(descriptor));
  }
  
  await writeFile(dirHandle, PARAMS_FILE, JSON.stringify(finalParams, null, 2));
  dbg.log("storage", `Draft saved successfully to '${baseDir}'.`);
}

export async function clearDraft(baseDir) {
  dbg.log("storage", `Clearing draft directory '${baseDir}'...`);
  try {
    if (navigator.storage && navigator.storage.getDirectory) {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(baseDir, { recursive: true });
      dbg.log("storage", `Cleared draft directory '${baseDir}' from OPFS.`);
    }
  } catch (e) {
    if (e.name !== 'NotFoundError') {
      dbg.error("storage", `Failed to clear draft directory '${baseDir}'`, e);
    }
  }
}