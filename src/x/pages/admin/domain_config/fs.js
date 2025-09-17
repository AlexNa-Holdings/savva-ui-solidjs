// src/x/pages/admin/domain_config/fs.js
import { dbg } from "../../../../utils/debug.js";

async function getRoot() {
  if (!navigator.storage?.getDirectory) throw new Error("Origin Private File System API not available.");
  return navigator.storage.getDirectory();
}

function splitPath(p) {
  const clean = String(p || "").replace(/^\/+/, "").replace(/\/+$/, "");
  return clean ? clean.split("/") : [];
}

export async function getDirHandle(path, opts = {}) {
  let handle = await getRoot();
  for (const part of splitPath(path)) {
    handle = await handle.getDirectoryHandle(part, { create: !!opts.create });
  }
  return handle;
}

export async function resetDir(path) {
  const parts = splitPath(path);
  if (!parts.length) return;
  const leaf = parts.pop();
  let parent = await getRoot();
  for (const p of parts) parent = await parent.getDirectoryHandle(p, { create: true });
  try { await parent.removeEntry(leaf, { recursive: true }); }
  catch (e) { if ((e?.name || "").toLowerCase() !== "notfounderror") dbg.warn("OPFS: removeEntry failed", e); }
  await parent.getDirectoryHandle(leaf, { create: true });
}

export async function writeFile(baseDirHandle, relPath, content) {
  const parts = splitPath(relPath);
  const fileName = parts.pop();
  let dir = baseDirHandle;
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const w = await fileHandle.createWritable();
  if (content instanceof Blob) await w.write(content);
  else if (typeof content === "string") await w.write(new Blob([content], { type: "text/plain" }));
  else if (content != null) await w.write(new Blob([content]));
  await w.close();
}

export async function listFiles(path) {
  const dir = await getDirHandle(path, { create: true });
  const out = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === "file") {
      try { const f = await handle.getFile(); out.push({ name, type: "file", size: f.size }); }
      catch { out.push({ name, type: "file" }); }
    } else {
      out.push({ name, type: "dir" });
    }
  }
  out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
  return out;
}

export async function readFileAsBlob(path) {
  try {
    const parts = splitPath(path);
    const fileName = parts.pop();
    let dir = await getRoot();
    for (const p of parts) dir = await dir.getDirectoryHandle(p);
    const fileHandle = await dir.getFileHandle(fileName);
    return await fileHandle.getFile();
  } catch (e) {
    if ((e?.name || "").toLowerCase() !== "notfounderror") dbg.error("OPFS", `Failed to read blob for ${path}`, e);
    return null;
  }
}

/* new: mkdir and delete selected entry */
export async function createDir(baseDirPath, relPath) {
  const base = await getDirHandle(baseDirPath, { create: true });
  let dir = base;
  for (const part of splitPath(relPath)) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  return dir;
}

export async function deleteEntry(baseDirPath, relPath) {
  const parts = splitPath(relPath);
  if (!parts.length) return;
  const leaf = parts.pop();
  let parent = await getDirHandle(baseDirPath, { create: true });
  for (const p of parts) parent = await parent.getDirectoryHandle(p, { create: true });
  try {
    await parent.removeEntry(leaf, { recursive: true });
  } catch (e) {
    if ((e?.name || "").toLowerCase() !== "notfounderror") throw e;
  }
}
