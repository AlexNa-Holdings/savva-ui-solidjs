// src/x/pages/admin/domain_config/remoteScan.js
import { dbg } from "../../../../utils/debug.js";

/* utils */

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
    .trim()
    .replace(/^[.][/]/, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function isProbablyIpfsCid(name) {
  // Heuristics for CIDv0 (Qm...) or CIDv1 (baf..., bafy..., bafk...)
  if (!name) return false;
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(name)) return true; // base58btc 46 chars
  if (/^ba[fnky][a-z0-9]{20,}$/i.test(name)) return true;      // loose CIDv1 pattern
  return false;
}

function isDotOrRoot(name) {
  return name === "." || name === ".." || name === "";
}

/* listing parsers */

function parseJsonListing(json = {}) {
  let items = [];

  if (Array.isArray(json)) items = json;
  if (Array.isArray(json?.entries)) items = json.entries;
  if (Array.isArray(json?.Entries)) items = json.Entries;
  if (Array.isArray(json?.files)) items = json.files;
  if (Array.isArray(json?.items)) items = json.items;
  if (Array.isArray(json?.list)) items = json.list;

  const files = [];
  const dirs = [];

  for (const it of items) {
    const raw = toName(it);
    const name = normalizeName(raw);
    if (!name || isDotOrRoot(name)) continue;
    // Drop obvious IPFS crumbs and self/parent artifacts
    if (isProbablyIpfsCid(name) || name.toLowerCase() === "uploads") continue;

    if (isDirMark(it) || raw?.endsWith?.("/")) dirs.push(name);
    else files.push(name);
  }
  return { files, dirs };
}

/**
 * HTML autoindex parser that returns only names relative to the currently
 * listed directory. It aggressively ignores:
 *  - absolute links (/ipfs/... or starting with "/") unless they resolve to a file basename
 *  - any scheme (http:, https:, ipfs:, ipns:, data:, blob:, javascript:, mailto:)
 *  - links that contain query/hash; for IPFS "...?filename=..." we salvage the filename
 *  - parent ("../") and root ("/") entries
 *  - bare CIDs (Qm..., baf..., etc.) and "uploads" crumbs that are not files
 */
function parseHtmlListing(html = "") {
  const hrefs = [...html.matchAll(/href\s*=\s*"(.*?)"/gi)]
    .map((m) => decodeURIComponent(String(m[1] || "").trim()))
    .filter(Boolean);

  const filesSet = new Set();
  const dirsSet = new Set();

  const hasScheme = (s) => /^[a-z][a-z0-9+.-]*:/i.test(s); // http:, ipfs:, data:, etc.

  for (let h of hrefs) {
    // Try to salvage ?filename= when present (IPFS download links)
    if (/\?/.test(h)) {
      try {
        const u = new URL(h, "http://x/"); // base needed for relative URLs
        const fname = (u.searchParams.get("filename") || "").trim();
        if (fname) {
          const n = normalizeName(fname);
          if (n && !n.endsWith("/")) filesSet.add(n);
          continue;
        }
      } catch {
        /* ignore parse errors; will continue below */
      }
      // strip query/hash for further checks
      h = h.split("#", 1)[0].split("?", 1)[0];
    }

    if (!h) continue;
    if (h === "../" || h === "/" || h === ".") continue;
    if (hasScheme(h)) continue; // http:, ipfs:, data:, etc.

    // Absolute paths (e.g., /ipfs/<cid>/uploads/pic.png OR /ipfs/<cid>)
    if (h.startsWith("/")) {
      const segs = h.split("/");
      const last = normalizeName(segs.pop() || "");
      const penultimate = normalizeName(segs.pop() || "");
      // If last is empty, it's a directory entry with trailing slash — skip here
      if (!last) continue;
      // Drop bare CIDs and "uploads" crumbs
      if (isProbablyIpfsCid(last) || last.toLowerCase() === "uploads") continue;
      // If we see "/ipfs/<cid>/uploads" (no trailing slash), treat as directory and skip
      if (penultimate.toLowerCase() === "uploads" && isProbablyIpfsCid(last)) continue;
      // Otherwise keep the basename; if it looks like a directory, treat as dir
      if (h.endsWith("/")) dirsSet.add(last);
      else filesSet.add(last);
      continue;
    }

    // Relative cleanup
    if (h.startsWith("./")) h = h.slice(2);
    const clean = normalizeName(h);
    if (!clean || isDotOrRoot(clean)) continue;

    // Filter out obvious crumbs
    if (isProbablyIpfsCid(clean) || clean.toLowerCase() === "uploads") continue;

    if (h.endsWith("/")) dirsSet.add(clean);
    else filesSet.add(clean);
  }

  return { files: [...filesSet], dirs: [...dirsSet] };
}

/* fetching with loose content-type handling */

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

  dbg.log("DomainConfigPage", "fetch/status", { url, ok, status: r.status, contentType: ctRaw });
  if (!ok) return null;

  if (ct.includes("application/json") || ct.includes("text/json")) {
    try {
      return { kind: "json", data: await r.json() };
    } catch (e) {
      dbg.log("DomainConfigPage", "fetch/json-parse-fail", { url, error: String(e) });
      return null;
    }
  }
  if (ct.includes("text/html")) return { kind: "html", data: await r.text() };
  if (ct.includes("text/plain")) {
    const text = await r.text();
    try { return { kind: "json", data: JSON.parse(text) }; }
    catch { return { kind: "text", data: text }; }
  }

  const raw = await r.text();
  const trimmed = raw.trim();

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try { return { kind: "json", data: JSON.parse(trimmed) }; }
    catch (e) { dbg.log("DomainConfigPage", "fetch/heuristic-json-fail", { url, error: String(e) }); }
  }
  if (/<a\s+href=/i.test(trimmed) || /<html/i.test(trimmed)) return { kind: "html", data: trimmed };
  return { kind: "other", data: trimmed };
}

/* directory discovery */

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
        dbg.log("DomainConfigPage", "listing/json", { url, files: files.length, dirs: dirs.length });
        if (files.length || dirs.length) return { files, dirs };
      } else if (res.kind === "html") {
        const { files, dirs } = parseHtmlListing(res.data);
        dbg.log("DomainConfigPage", "listing/html", { url, files: files.length, dirs: dirs.length });
        if (files.length || dirs.length) return { files, dirs };
      } else if (res.kind === "text" || res.kind === "other") {
        const asHtml = parseHtmlListing(String(res.data || ""));
        if (asHtml.files.length || asHtml.dirs.length) {
          dbg.log("DomainConfigPage", "listing/other-as-html", { url, files: asHtml.files.length, dirs: asHtml.dirs.length });
          return asHtml;
        }
        try {
          const maybe = JSON.parse(String(res.data || ""));
          const asJson = parseJsonListing(maybe);
          if (asJson.files.length || asJson.dirs.length) {
            dbg.log("DomainConfigPage", "listing/other-as-json", { url, files: asJson.files.length, dirs: asJson.dirs.length });
            return asJson;
          }
        } catch {}
      }
    } catch (e) {
      dbg.log("DomainConfigPage", "listing/error", { url, error: String(e) });
    }
  }

  dbg.log("DomainConfigPage", "listing/none-for-subpath", { base, subPath });
  return { files: [], dirs: [] };
}

async function tryListDirectory(prefixUrl, subPath, depth, maxDepth, cap, opts) {
  const { files, dirs } = await listDirectoryPreferJson(prefixUrl, subPath);
  if (!files.length && !dirs.length) return [];

  const out = [];

  // Files
  for (const f of files) {
    if (cap.count >= cap.max) break;
    // Final guard against crumbs
    if (!f || isDotOrRoot(f) || isProbablyIpfsCid(f) || f.toLowerCase() === "uploads") continue;
    const rel = subPath ? `${subPath}${f}` : f;
    out.push(rel);
    cap.count++;
  }

  // Dirs
  for (const d of dirs) {
    if (cap.count >= cap.max) break;
    if (!d || isDotOrRoot(d)) continue;
    const child = await discoverEntriesOrThrow(prefixUrl, `${subPath}${d}/`, depth + 1, maxDepth, cap, opts);
    out.push(...child);
  }

  return out;
}

/**
 * Discover all entries under prefixUrl/subPath (files are returned as relative paths).
 * Tries manifest files first, then autoindex listings (HTML/JSON/heuristics).
 */
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

  // 1) manifests (if present)
  if (opts.tryManifests) {
    for (const mf of ["__files.json", "files.json", "_files.json"]) {
      const mfUrl = ensureSlash(url) + mf;
      try {
        const r = await fetch(mfUrl, { cache: "no-store" });
        if (r.ok) {
          const json = await r.json();

          let rawItems = [];
          if (Array.isArray(json)) rawItems = json;
          else if (Array.isArray(json?.files)) rawItems = json.files;
          else if (Array.isArray(json?.entries)) rawItems = json.entries;
          else if (Array.isArray(json?.Entries)) rawItems = json.Entries;
          else if (Array.isArray(json?.items)) rawItems = json.items;
          else if (Array.isArray(json?.list)) rawItems = json.list;

          const out = [];
          for (const it of rawItems) {
            if (cap.count >= cap.max) break;

            const nameRaw = toName(it);
            const name = normalizeName(nameRaw);
            if (!name || isDotOrRoot(name)) continue;
            if (isProbablyIpfsCid(name) || name.toLowerCase() === "uploads") continue;

            const hasSlash = nameRaw.endsWith?.("/");
            const looksDirByType = isDirMark(it);

            if (looksDirByType || hasSlash) {
              const child = await discoverEntriesOrThrow(prefixUrl, `${subPath}${name}/`, depth + 1, maxDepth, cap, opts);
              out.push(...child);
            } else {
              let handled = false;
              if (opts.dirProbe !== false) {
                const maybe = await tryListDirectory(prefixUrl, `${subPath}${name}/`, depth + 1, maxDepth, cap, opts);
                if (maybe.length) {
                  out.push(...maybe);
                  handled = true;
                }
              }
              if (!handled) {
                out.push(subPath ? `${subPath}${name}` : name);
                cap.count++;
              }
            }
          }

          dbg.log("DomainConfigPage", "manifest/found", { url: mfUrl, items: out.length, depth, subPath });
          return out;
        } else {
          if (!opts.quietManifest404 || (r.status !== 404 && r.status !== 403)) {
            dbg.log("DomainConfigPage", "manifest/miss", { url: mfUrl, status: r.status });
          }
        }
      } catch (e) {
        dbg.log("DomainConfigPage", "manifest/error", { url: mfUrl, error: String(e) });
      }
    }
  }

  // 2) autoindex listing
  const listed = await tryListDirectory(prefixUrl, subPath, depth, maxDepth, cap, opts);
  if (listed.length) {
    dbg.log("DomainConfigPage", "listing/used", { url, files: listed.length, depth, subPath });
    return listed;
  }

  // 3) root-only error
  if (depth === 0) {
    const err = new Error(`No manifest or directory listing available at ${url}`);
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
 *  - logs everything (and encodes URLs so names with spaces like `%20` are handled).
 */
export async function scanAndDownload(prefixUrl, saveFile, opts = {}) {
  const maxDepth = opts.maxDepth ?? 16;
  const cap = { count: 0, max: opts.cap ?? 10000 };

  dbg.log("DomainConfigPage", "scan/start", { prefixUrl, maxDepth, cap: cap.max });

  const discovered = await discoverEntriesOrThrow(
    prefixUrl,
    "",
    0,
    maxDepth,
    cap,
    { tryManifests: true, quietManifest404: true, ...(opts || {}) }
  );
  dbg.log("DomainConfigPage", "scan/discovered", { count: discovered.length, sample: discovered.slice(0, 10) });

  let saved = 0;
  let idx = 0;

  for (const rel of discovered) {
    idx++;
    const fileUrl = ensureSlash(prefixUrl) + encodeURI(rel); // important for names with spaces/%20
    try {
      dbg.log("DomainConfigPage", "download/begin", { i: idx, of: discovered.length, rel, url: fileUrl });

      const r = await fetch(fileUrl, { cache: "no-store" });
      if (!r.ok) {
        dbg.log("DomainConfigPage", "download/failed", { rel, url: fileUrl, status: r.status });
        continue;
      }

      const blob = await r.blob();
      const size = blob.size ?? 0;

      let storagePath;
      try {
        storagePath = await saveFile(rel, blob);
      } catch (e) {
        dbg.log("DomainConfigPage", "save/error", { rel, size, error: String(e) });
        continue;
      }

      saved++;
      dbg.log("DomainConfigPage", "save/done", { rel, size, storagePath: storagePath ?? "(saveFile returned no path)" });

      opts.onProgress?.({ idx, total: discovered.length, rel, size, storagePath });
    } catch (e) {
      dbg.log("DomainConfigPage", "download/error", { rel, url: fileUrl, error: String(e) });
    }
  }

  dbg.log("DomainConfigPage", "scan/complete", { discovered: discovered.length, saved });
  return { discovered, saved };
}
