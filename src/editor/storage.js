// src/editor/storage.js
import { dbg } from "../utils/debug";
import { parse, stringify } from "yaml";

const NEW_POST_DIR = "new_post";

async function getDirectoryHandle(dirName) {
  try {
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

export async function loadNewPostDraft() {
  dbg.log("storage", "Loading new post draft...");
  const dirHandle = await getDirectoryHandle(NEW_POST_DIR);
  const descriptorYaml = await readFile(dirHandle, "info.yaml");
  
  if (!descriptorYaml) {
    dbg.log("storage", "No draft found.");
    return null;
  }

  const descriptor = parse(descriptorYaml);
  const postData = {};

  for (const lang in descriptor.locales) {
    const localeData = descriptor.locales[lang];
    postData[lang] = { title: localeData.title || "", body: "", chapters: [] };
    if (localeData.data_path) {
      postData[lang].body = await readFile(dirHandle, localeData.data_path) || "";
    }
    if (Array.isArray(localeData.chapters)) {
      for (const chapter of localeData.chapters) {
        if (chapter.data_path) {
          const chapterBody = await readFile(dirHandle, chapter.data_path) || "";
          postData[lang].chapters.push({ title: chapter.title, body: chapterBody });
        }
      }
    }
  }
  
  dbg.log("storage", "Draft loaded successfully.", postData);
  return postData;
}

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
      data_path: dataPath,
      chapters: []
    };
    
    await writeFile(dirHandle, dataPath, data.body || "");

    if (Array.isArray(data.chapters)) {
      for (let i = 0; i < data.chapters.length; i++) {
        const chapter = data.chapters[i];
        const chapterPath = `${lang}/chapters/${i + 1}.md`;
        descriptor.locales[lang].chapters.push({
          title: chapter.title,
          data_path: chapterPath,
        });
        await writeFile(dirHandle, chapterPath, chapter.body || "");
      }
    }
  }

  await writeFile(dirHandle, "info.yaml", stringify(descriptor));
  dbg.log("storage", "Draft saved successfully.");
}