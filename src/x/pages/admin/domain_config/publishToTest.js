// src/x/pages/admin/domain_config/publishToTest.js
import { httpBase } from "../../../../net/endpoints.js";

/**
 * Upload the entire domain pack to /upload-temp-assets as a single multipart POST.
 * - All parts are named "<domain>/<relative-path>"
 * - config.yaml is appended first to establish the folder root for the backend
 */
export async function uploadFilesToTempAssets(app, domain, files, opts = {}) {
  const t = app.t;
  if (!domain) throw new Error(t("errors.missingParam"));
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error(t("admin.domainConfig.upload.err"));
  }

  // Materialize to { path, file } and normalize paths
  const items = files
    .map(toFileEntry)
    .map((it) => ({ ...it, path: normalizeRelPath(it.path || it.file?.name || "") }))
    .filter((it) => it.path); // drop empties just in case

  const hasConfig = items.some((it) => it.path.toLowerCase() === "config.yaml");
  if (!hasConfig) {
    throw new Error(`${t("admin.domainConfig.upload.err")}: config.yaml`);
  }

  // Ensure config.yaml goes first; stabilize order for the rest
  items.sort((a, b) => {
    const ac = a.path.toLowerCase() === "config.yaml";
    const bc = b.path.toLowerCase() === "config.yaml";
    if (ac && !bc) return -1;
    if (!ac && bc) return 1;
    return a.path.localeCompare(b.path);
  });

  const form = new FormData();
  form.append("domain", domain);

  for (const it of items) {
    const nameOnWire = `${domain}/${it.path}`; // enforce a single, consistent folder root
    form.append("file", it.file, nameOnWire);
  }

  const url = `${httpBase()}upload-temp-assets?domain=${encodeURIComponent(domain)}`;

  // Same transport pattern as /store-dir (single multipart POST, with credentials). :contentReference[oaicite:3]{index=3}
  const body = await xhrPost(app, url, form, opts.onProgress);

  if (body?.error) {
    // Surface backend error via i18n context
    throw new Error(`${t("admin.domainConfig.upload.err")}: ${body.error}`);
  }
  return body;
}

function toFileEntry(f) {
  if (f?.file instanceof File) return { path: f.path || f.file.name, file: f.file };
  if (f?.blob instanceof Blob) {
    const name = f.path || "file";
    const type = f.blob.type || f.type || "application/octet-stream";
    return { path: f.path || name, file: new File([f.blob], name, { type }) };
  }
  if (typeof f?.text === "string") {
    const type = f.type || "text/plain;charset=utf-8";
    const blob = new Blob([f.text], { type });
    const name = f.path || "file.txt";
    return { path: f.path || name, file: new File([blob], name, { type: blob.type }) };
  }
  if (f?.data && typeof f.path === "string") {
    const blob = new Blob([f.data], { type: f.type || "application/octet-stream" });
    const name = f.path;
    return { path: name, file: new File([blob], name, { type: blob.type }) };
  }
  throw new Error("Bad file entry");
}

function normalizeRelPath(p) {
  let s = String(p || "");
  s = s.replace(/^\/+/, ""); // strip leading slash
  s = s.replace(/\/+/g, "/"); // collapse
  // defensively remove ".." segments
  while (s.includes("..")) s = s.replace(/(^|\/)\.\.(?=\/|$)/g, "");
  return s;
}

function xhrPost(app, url, formData, onProgress) {
  const t = app.t;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        try {
          onProgress?.({ loaded: e.loaded, total: e.total, pct: Math.round((e.loaded / e.total) * 100) });
        } catch {}
      }
    };

    xhr.onload = () => {
      let json = null;
      try { json = JSON.parse(xhr.responseText || "{}"); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(json || {});
      } else {
        const msg = json?.error || json?.message || `${xhr.status} ${xhr.statusText}`;
        reject(new Error(`${t("admin.domainConfig.upload.err")}: ${msg}`));
      }
    };

    xhr.onerror = () => reject(new Error(t("error.connection.message")));
    xhr.send(formData);
  });
}
