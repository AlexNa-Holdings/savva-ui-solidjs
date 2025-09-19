// src/x/pages/admin/domain_config/remoteScan.js
import { dbg } from "../../../../utils/debug.js";

const ensureSlash = (s) => (s && !s.endsWith("/") ? s + "/" : s || "/");

function toName(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  return v.name ?? v.Name ?? v.path ?? v.href ?? v.url ?? "";
}

function isDirMark(v) {
  if (!v) return false;
  if (typeof v === "string") return v.endsWith("/");
  const t = String(v.type || v.Type || "").toLowerCase();
  if (t === "dir" || t === "directory" || t === "folder") return true;
  const n = toName(v);
  return typeof n === "string" && n.endsWith("/");
}

function normalizeName(n) {
  return String(n || "")
    .replace(/^[.][/]/, "")
    .replace(/\/+$/, "");
}

function parseJsonListing(json = {}) {
  let items = [];

  // Arrays (["a.txt","b/"] or [{name,type}, ...])
  if (Array.isArray(json)) items = json;

  // Common keys: nginx autoindex (entries), fancyindex (entries), custom (files/items/list)
  if (Array.isArray(json?.entries)) items = json.entries;
  if (Array.isArray(json?.Entries)) items = json.Entries;
  if (Array.isArray(json?.files)) items = json.files;
  if (Array.isArray(json?.items)) items = json.items;
  if (Array.isArray(json?.list)) items = json.list;

  const files = [],
    dirs = [];
  for (const it of items) {
    const name = normalizeName(toName(it));
    if (!name) continue;
    if (isDirMark(it) || it === name + "/") dirs.push(name);
    else files.push(name);
  }
  return { files, dirs };
}

function parseHtmlListing(html = "") {
  const hrefs = [...html.matchAll(/href\s*=\s*"(.*?)"/gi)]
    .map((m) => m[1])
    .filter(Boolean);
  const cleaned = hrefs
    .map((h) => decodeURIComponent(h))
    .filter(
      (h) =>
        !h.startsWith("?") && !h.startsWith("#") && h !== "../" && h !== "/"
    )
    .filter((h) => !/^https?:\/\//i.test(h))
    .map((h) => (h.startsWith("./") ? h.slice(2) : h));
  const files = [],
    dirs = [];
  for (const h of cleaned)
    (h.endsWith("/") ? dirs : files).push(h.replace(/\/+$/, ""));
  return { files, dirs };
}

async function fetchMaybeJson(url) {
  let r;
  try {
    r = await fetch(url, { cache: "no-store" });
  } catch (e) {
    dbg.log("DomainConfigPage", "fetch/error", { url, error: String(e) });
    return null;
  }
  const ok = r.ok;
  const ctRaw = r.headers.get("content-type") || "";
  const ct = ctRaw.toLowerCase();

  dbg.log("DomainConfigPage", "fetch/status", {
    url,
    ok,
    status: r.status,
    contentType: ctRaw,
  });

  if (!ok) return null;

  // Prefer declared types first
  if (ct.includes("application/json") || ct.includes("text/json")) {
    try {
      return { kind: "json", data: await r.json() };
    } catch (e) {
      dbg.log("DomainConfigPage", "fetch/json-parse-fail", {
        url,
        error: String(e),
      });
      return null;
    }
  }
  if (ct.includes("text/html")) {
    return { kind: "html", data: await r.text() };
  }
  if (ct.includes("text/plain")) {
    const text = await r.text();
    // Try to parse JSON from text/plain
    try {
      const maybe = JSON.parse(text);
      return { kind: "json", data: maybe };
    } catch {
      return { kind: "text", data: text };
    }
  }

  // Unknown/empty/odd content types:
  const raw = await r.text();
  const trimmed = raw.trim();

  // Heuristic: looks like JSON
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return { kind: "json", data: JSON.parse(trimmed) };
    } catch (e) {
      dbg.log("DomainConfigPage", "fetch/heuristic-json-fail", {
        url,
        error: String(e),
      });
    }
  }

  // Heuristic: looks like HTML (has <a href=)
  if (/<a\s+href=/i.test(trimmed) || /<html/i.test(trimmed)) {
    return { kind: "html", data: trimmed };
  }

  // Fallback: mark as "other" so caller can decide
  return { kind: "other", data: trimmed };
}

async function listDirectoryPreferJson(prefixUrl, subPath) {
  const base = ensureSlash(prefixUrl) + subPath;

  const attempts = [
    base,
    base + (base.includes("?") ? "&" : "?") + "format=json",
    base + (base.includes("?") ? "&" : "?") + "json=1",
  ];

  for (const url of attempts) {
    try {
      dbg.log("DomainConfigPage", "listing/attempt", { url, subPath });
      const res = await fetchMaybeJson(url);
      if (!res) continue;

      if (res.kind === "json") {
        const { files, dirs } = parseJsonListing(res.data);
        dbg.log("DomainConfigPage", "listing/json", {
          url,
          files: files.length,
          dirs: dirs.length,
        });
        if (files.length || dirs.length) return { files, dirs };
      } else if (res.kind === "html") {
        const { files, dirs } = parseHtmlListing(res.data);
        dbg.log("DomainConfigPage", "listing/html", {
          url,
          files: files.length,
          dirs: dirs.length,
        });
        if (files.length || dirs.length) return { files, dirs };
      } else if (res.kind === "text" || res.kind === "other") {
        // Try both parsers on unknown content
        const asHtml = parseHtmlListing(String(res.data || ""));
        if (asHtml.files.length || asHtml.dirs.length) {
          dbg.log("DomainConfigPage", "listing/other-as-html", {
            url,
            files: asHtml.files.length,
            dirs: asHtml.dirs.length,
          });
          return asHtml;
        }
        try {
          const maybe = JSON.parse(String(res.data || ""));
          const asJson = parseJsonListing(maybe);
          if (asJson.files.length || asJson.dirs.length) {
            dbg.log("DomainConfigPage", "listing/other-as-json", {
              url,
              files: asJson.files.length,
              dirs: asJson.dirs.length,
            });
            return asJson;
          }
        } catch (_) {}
      }
    } catch (e) {
      dbg.log("DomainConfigPage", "listing/error", { url, error: String(e) });
    }
  }

  dbg.log("DomainConfigPage", "listing/none-for-subpath", { base, subPath });
  return { files: [], dirs: [] };
}

async function tryListDirectory(
  prefixUrl,
  subPath,
  depth,
  maxDepth,
  cap,
  opts
) {
  const { files, dirs } = await listDirectoryPreferJson(prefixUrl, subPath);
  if (!files.length && !dirs.length) return [];

  const out = [];
  for (const f of files) {
    if (cap.count >= cap.max) break;
    const rel = subPath ? `${subPath}${f}` : f;
    out.push(rel);
    cap.count++;
  }
  for (const d of dirs) {
    if (cap.count >= cap.max) break;
    const child = await discoverEntriesOrThrow(
      prefixUrl,
      `${subPath}${d}/`,
      depth + 1,
      maxDepth,
      cap,
      opts
    );
    out.push(...child);
  }
  return out;
}

export async function discoverEntriesOrThrow(
  prefixUrl,
  subPath = "",
  depth = 0,
  maxDepth = 16,
  cap = { count: 0, max: 10000 },
  opts = { tryManifests: true, quietManifest404: true }
) {
  const url = ensureSlash(prefixUrl) + subPath;
  if (depth > maxDepth) return [];

  // 1) Manifests first (optional but ON by default)
  if (opts.tryManifests) {
    for (const mf of ["__files.json", "files.json", "_files.json"]) {
      const mfUrl = ensureSlash(url) + mf;
      try {
        const r = await fetch(mfUrl, { cache: "no-store" });
        if (r.ok) {
          const json = await r.json();

          // Normalize to an array of "items" that we can inspect for name + type
          let rawItems = [];
          if (Array.isArray(json)) {
            rawItems = json;
          } else if (Array.isArray(json?.files)) {
            rawItems = json.files;
          } else if (Array.isArray(json?.entries)) {
            rawItems = json.entries;
          } else if (Array.isArray(json?.Entries)) {
            rawItems = json.Entries;
          } else if (Array.isArray(json?.items)) {
            rawItems = json.items;
          } else if (Array.isArray(json?.list)) {
            rawItems = json.list;
          }

          const out = [];
          for (const it of rawItems) {
            if (cap.count >= cap.max) break;

            const nameRaw = toName(it);
            if (!nameRaw) continue;

            const name = normalizeName(nameRaw);
            const hasSlash = nameRaw.endsWith("/");
            const looksDirByType = isDirMark(it); // type: 'directory' | 'dir' | 'folder' etc.

            if (looksDirByType || hasSlash) {
              // Definitely a directory — recurse
              const child = await discoverEntriesOrThrow(
                prefixUrl,
                `${subPath}${name}/`,
                depth + 1,
                maxDepth,
                cap,
                opts
              );
              out.push(...child);
            } else {
              // Might be file, but could also be a directory listed without trailing slash and no 'type'
              let handled = false;

              // Only probe directories when we truly don't know the type
              if (opts.dirProbe !== false) {
                const maybe = await tryListDirectory(
                  prefixUrl,
                  `${subPath}${name}/`,
                  depth + 1,
                  maxDepth,
                  cap,
                  opts
                );
                if (maybe.length) {
                  out.push(...maybe);
                  handled = true;
                }
              }

              if (!handled) {
                // Treat as a file
                out.push(subPath ? `${subPath}${name}` : name);
                cap.count++;
              }
            }
          }

          dbg.log("DomainConfigPage", "manifest/found", {
            url: mfUrl,
            items: out.length,
            depth,
            subPath,
          });
          return out;
        } else {
          // Quiet 404/403 unless explicitly requested
          if (
            !opts.quietManifest404 ||
            (r.status !== 404 && r.status !== 403)
          ) {
            dbg.log("DomainConfigPage", "manifest/miss", {
              url: mfUrl,
              status: r.status,
            });
          }
        }
      } catch (e) {
        dbg.log("DomainConfigPage", "manifest/error", {
          url: mfUrl,
          error: String(e),
        });
      }
    }
  }

  // 2) Directory listing (JSON/HTML/heuristics)
  const listed = await tryListDirectory(
    prefixUrl,
    subPath,
    depth,
    maxDepth,
    cap,
    opts
  );
  if (listed.length) {
    dbg.log("DomainConfigPage", "listing/used", {
      url,
      files: listed.length,
      depth,
      subPath,
    });
    return listed;
  }

  // 3) Root-only error
  if (depth === 0) {
    const err = new Error(
      `No manifest or directory listing available at ${url}`
    );
    err.code = "NO_LISTING";
    dbg.log("DomainConfigPage", "listing/none", { url, error: err.message });
    throw err;
  }
  return [];
}

/**
 * High-level helper:
 *  - discovers files,
 *  - downloads each one,
 *  - saves via user-provided storage writer,
 *  - logs everything so we can trace where the 31 files went.
 *
 * @param {string} prefixUrl - remote base URL (e.g. https://domain-assets/paris.camp/)
 * @param {(relPath: string, blob: Blob) => Promise<string|void>} saveFile
 *        Storage writer that returns the final storage path (for logging).
 *        Example: (rel, blob) => writeToIndexedDB(domain, rel, blob) -> "domain_assets/paris.camp/rel"
 * @param {{ maxDepth?: number, cap?: number, onProgress?:(p)=>void }} [opts]
 * @returns {Promise<{ discovered:string[], saved:number }>}
 */
export async function scanAndDownload(prefixUrl, saveFile, opts = {}) {
  const maxDepth = opts.maxDepth ?? 16;
  const cap = { count: 0, max: opts.cap ?? 10000 };

  dbg.log("DomainConfigPage", "scan/start", {
    prefixUrl,
    maxDepth,
    cap: cap.max,
  });

  const discovered = await discoverEntriesOrThrow(
    prefixUrl,
    "",
    0,
    maxDepth,
    cap,
    { tryManifests: true, quietManifest404: true, ...(opts || {}) }
  );
  dbg.log("DomainConfigPage", "scan/discovered", {
    count: discovered.length,
    sample: discovered.slice(0, 10),
  });

  let saved = 0;
  let idx = 0;

  for (const rel of discovered) {
    idx++;
    const fileUrl = ensureSlash(prefixUrl) + rel;
    try {
      dbg.log("DomainConfigPage", "download/begin", {
        i: idx,
        of: discovered.length,
        rel,
        url: fileUrl,
      });

      const r = await fetch(fileUrl, { cache: "no-store" });
      if (!r.ok) {
        dbg.log("DomainConfigPage", "download/failed", {
          rel,
          url: fileUrl,
          status: r.status,
        });
        continue;
      }

      const blob = await r.blob();
      const size = blob.size ?? 0;

      let storagePath;
      try {
        storagePath = await saveFile(rel, blob); // expect storagePath or void
      } catch (e) {
        dbg.log("DomainConfigPage", "save/error", {
          rel,
          size,
          error: String(e),
        });
        continue;
      }

      saved++;
      dbg.log("DomainConfigPage", "save/done", {
        rel,
        size,
        storagePath: storagePath ?? "(saveFile returned no path)",
      });

      opts.onProgress?.({
        idx,
        total: discovered.length,
        rel,
        size,
        storagePath,
      });
    } catch (e) {
      dbg.log("DomainConfigPage", "download/error", {
        rel,
        url: fileUrl,
        error: String(e),
      });
    }
  }

  dbg.log("DomainConfigPage", "scan/complete", {
    discovered: discovered.length,
    saved,
  });
  return { discovered, saved };
}
