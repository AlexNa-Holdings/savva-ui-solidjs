// src/editor/storage.js
import { dbg } from "../utils/debug";
import { parse, stringify } from "yaml";

const NEW_POST_DIR = "new_post";
const TEMP_EDIT_DIR = "temp_edit";

// --- Core OPFS Helpers ---

async function getDirectoryHandle(dirName) {
  try {
    // This API is only available in secure contexts (HTTPS or localhost)
    if (!navigator.storage || !navigator.storage.getDirectory) {
      dbg.warn("storage", "Origin Private File System API not available.");
      return null;
    }
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(dirName, { create: true });
  } catch (e) {
    dbg.error("storage", `Failed to get directory handle for '${dirName}'`, e);
    throw e;
  }
}

async function readFile(dirHandle, path) {
  if (!dirHandle) return null;
  try {
    const pathParts = path.split('/').filter(Boolean);
    let currentHandle = dirHandle;

    // Traverse directories
    for (let i = 0; i < pathParts.length - 1; i++) {
      currentHandle = await currentHandle.getDirectoryHandle(pathParts[i]);
    }

    // Get file in the final directory
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

// --- Post-Specific Logic ---

/**
 * Loads a post draft from the 'new_post' directory in OPFS.
 */
export async function loadNewPostDraft() {
  dbg.log("storage", "Loading new post draft...");
  const dirHandle = await getDirectoryHandle(NEW_POST_DIR);
  const descriptorYaml = await readFile(dirHandle, "info.yaml");
  
  // --- ADDED FOR DEBUGGING ---
  console.log("--- Draft info.yaml Content ---");
  console.log(descriptorYaml);
  // ---------------------------
  
  if (!descriptorYaml) {
    dbg.log("storage", "No draft found.");
    return null;
  }

  const descriptor = parse(descriptorYaml);
  const postData = {};

  for (const lang in descriptor.locales) {
    const localeData = descriptor.locales[lang];
    postData[lang] = { title: localeData.title || "" };
    if (localeData.data_path) {
      const body = await readFile(dirHandle, localeData.data_path);
      postData[lang].body = body || "";
    }
  }
  
  dbg.log("storage", "Draft loaded successfully.", postData);
  return postData;
}

/**
 * Saves a post draft to the 'new_post' directory in OPFS.
 */
export async function saveNewPostDraft(postData) {
  dbg.log("storage", "Saving new post draft...", postData);
  const dirHandle = await getDirectoryHandle(NEW_POST_DIR);
  
  const descriptor = {
    savva_spec_version: "2.0",
    mime_type: "text/markdown",
    locales: {}
  };

  for (const lang in postData) {
    const data = postData[lang];
    const dataPath = `${lang}/data.md`;
    
    descriptor.locales[lang] = {
      title: data.title || "",
      text_preview: (data.body || "").substring(0, 200),
      data_path: dataPath
    };
    
    await writeFile(dirHandle, dataPath, data.body || "");
  }

  await writeFile(dirHandle, "info.yaml", stringify(descriptor));
  dbg.log("storage", "Draft saved successfully.");
}