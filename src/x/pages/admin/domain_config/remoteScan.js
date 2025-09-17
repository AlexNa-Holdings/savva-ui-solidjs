// src/x/pages/admin/domain_config/remoteScan.js
import { dbg } from "../../../../utils/debug.js";

const ensureSlash = (s) => (s && !s.endsWith("/") ? s + "/" : s || "/");

function parseHtmlListing(html = "") {
  const hrefs = [...html.matchAll(/href\s*=\s*"(.*?)"/gi)].map((m) => m[1]).filter(Boolean);
  const cleaned = hrefs
    .map((h) => decodeURIComponent(h))
    .filter((h) => !h.startsWith("?") && !h.startsWith("#") && h !== "../" && h !== "/")
    .filter((h) => !/^https?:\/\//i.test(h))
    .map((h) => (h.startsWith("./") ? h.slice(2) : h));
  const files = [],
    dirs = [];
  for (const h of cleaned) (h.endsWith("/") ? dirs : files).push(h.replace(/\/+$/, ""));
  return { files, dirs };
}

export async function discoverEntriesOrThrow(prefixUrl, subPath = "", depth = 0, maxDepth = 8, cap = { count: 0, max: 10000 }) {
  const url = ensureSlash(prefixUrl) + subPath;
  if (depth > maxDepth) return [];
  // manifest candidates
  for (const mf of ["__files.json", "files.json", "_files.json"]) {
    try {
      const r = await fetch(ensureSlash(url) + mf, { cache: "no-store" });
      if (r.ok) {
        const json = await r.json();
        let items = Array.isArray(json) ? json : json?.files || [];
        items = items
          .map((x) => (typeof x === "string" ? x : x?.path))
          .filter(Boolean)
          .map((p) => (subPath ? `${subPath}${p}` : p));
        dbg.log("remoteScan", "manifest found", { url: ensureSlash(url) + mf, count: items.length });
        return items;
      }
    } catch {}
  }
  // directory listing
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (r.ok) {
      const ct = r.headers.get("content-type") || "";
      if (ct.includes("text/html")) {
        const html = await r.text();
        const { files, dirs } = parseHtmlListing(html);
        const out = [];
        for (const f of files) {
          if (cap.count >= cap.max) break;
          out.push(subPath ? `${subPath}${f}` : f);
          cap.count++;
        }
        for (const d of dirs) {
          if (cap.count >= cap.max) break;
          const child = await discoverEntriesOrThrow(prefixUrl, `${subPath}${d}/`, depth + 1, maxDepth, cap);
          out.push(...child);
        }
        return out;
      }
    }
  } catch {}
  if (depth === 0) {
    const err = new Error("No manifest or directory listing");
    err.code = "NO_LISTING";
    throw err;
  }
  return [];
}
