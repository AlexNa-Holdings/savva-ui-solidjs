// src/x/pages/admin/domain_config/collectDomainFiles.js
// Collect domain-config files from a store you pass in OR from OPFS by path.
// Returns: [{ path, file? , blob? , text? , type? }]

import { getDirHandle } from "./fs.js";

export async function collectDomainFiles(store) {
  if (!store) throw new Error("No domain store provided");

  if (typeof store.exportAsArray === "function") return normalize(await store.exportAsArray());
  if (typeof store.exportAll === "function") return normalize(await store.exportAll());

  const list = await listPaths(store);
  if (list.length) {
    const out = [];
    for (const path of list) {
      const e = await readOne(store, path);
      if (e) out.push(e);
    }
    if (out.length) return normalize(out);
  }

  if (Array.isArray(store.files)) return normalize(store.files);

  if (store.files instanceof Map) {
    const arr = [];
    for (const [path, v] of store.files.entries()) arr.push(materializeKV(path, v));
    return normalize(arr);
  }
  if (store.files && typeof store.files === "object") {
    const arr = [];
    for (const path of Object.keys(store.files)) arr.push(materializeKV(path, store.files[path]));
    if (arr.length) return normalize(arr);
  }

  if (store.state?.files instanceof Map) {
    const arr = [];
    for (const [path, v] of store.state.files.entries()) arr.push(materializeKV(path, v));
    return normalize(arr);
  }
  if (store.state?.files && typeof store.state.files === "object") {
    const arr = [];
    for (const path of Object.keys(store.state.files)) arr.push(materializeKV(path, store.state.files[path]));
    if (arr.length) return normalize(arr);
  }

  throw new Error("Unable to collect domain config files from the current store");
}

async function listPaths(store) {
  if (typeof store.listPaths === "function") return await store.listPaths();
  if (typeof store.listFiles === "function") return await store.listFiles();
  if (typeof store.list === "function")      return await store.list();
  return [];
}

async function readOne(store, path) {
  if (typeof store.getFileBlob === "function") {
    const blob = await store.getFileBlob(path);
    if (blob instanceof Blob) return { path, blob, type: blob.type || undefined };
  }
  if (typeof store.readFile === "function") {
    const res = await store.readFile(path);
    if (res instanceof Blob) return { path, blob: res, type: res.type || undefined };
    if (typeof res === "string") return { path, text: res };
  }
  return null;
}

function materializeKV(path, v) {
  if (v instanceof File) return { path, file: v };
  if (v instanceof Blob) return { path, blob: v, type: v.type || undefined };
  if (typeof v === "string") return { path, text: v };
  if (v?.data) {
    const blob = new Blob([v.data], { type: v.type || "application/octet-stream" });
    return { path, blob, type: blob.type };
  }
  return { path, blob: new Blob([new Uint8Array(0)], { type: "application/octet-stream" }) };
}

function normalize(arr) {
  return arr.map((it) => {
    if (it?.file instanceof File) return it;
    if (it?.blob instanceof Blob) return it;
    if (typeof it?.text === "string") return it;
    if (it?.data && typeof it.path === "string") {
      const blob = new Blob([it.data], { type: it.type || "application/octet-stream" });
      return { path: it.path, blob, type: blob.type };
    }
    return it;
  });
}

// --- NEW: OPFS exporter (walks a directory recursively and returns {path,file}) ---
export async function collectOpfsDomainFiles(baseDirPath) {
  if (!baseDirPath) throw new Error("Missing OPFS baseDirPath");
  const root = await getDirHandle(baseDirPath, { create: true });
  const out = [];
  await walk(root, "", out);
  return out;
}

async function walk(dirHandle, prefix, out) {
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === "file") {
      const file = await handle.getFile();
      out.push({ path: prefix ? `${prefix}/${name}` : name, file });
    } else if (handle.kind === "directory") {
      const child = await dirHandle.getDirectoryHandle(name);
      await walk(child, prefix ? `${prefix}/${name}` : name, out);
    }
  }
}
