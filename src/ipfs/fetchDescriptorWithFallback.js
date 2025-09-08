// src/ipfs/fetchDescriptorWithFallback.js
// src/ipfs/fetchDescriptorWithFallback.js
import { dbg } from "../utils/debug.js";
import { getPostDescriptorPath } from "./utils.js";

const L = (...a) => dbg.log("fetchDescriptorWithFallback", ...a);
const E = (...a) => dbg.error("fetchDescriptorWithFallback", ...a);

function looksLikeHtml(contentType, textSample) {
  if (contentType && /html/i.test(contentType)) return true;
  const s = String(textSample || "").trim().slice(0, 200);
  return /^<!doctype html/i.test(s) || /^<html[\s>]/i.test(s);
}

function baseCidFrom(pathOrCid) {
  const s = String(pathOrCid || "").replace(/^\/+|\/+$/g, "");
  const first = s.split("/")[0].replace(/^ipfs\//, "");
  return first;
}

/**
 * Fetches descriptor text; if the first response is HTML (legacy folder CID),
 * retries with <cid>/info.yaml. Returns { text, finalPath, usedFallback }.
 * 
 * `fetcher` must be a function (path) => Promise<Response>.
 * If you use app.ipfsFetch(path), pass: (p) => app.ipfsFetch(p)
 */
export async function fetchDescriptorWithFallback(app, post, fetcher) {
  const primaryPath = getPostDescriptorPath(post);
  if (!primaryPath) throw new Error("Descriptor path is empty");

  async function fetchText(path) {
    const res = await fetcher(path);
    const ct = res.headers?.get?.("content-type") || "";
    const text = await res.text();
    return { ok: res.ok, ct, text };
  }

  L("try primary", { path: primaryPath });
  let first;
  try {
    first = await fetchText(primaryPath);
  } catch (err) {
    E("primary fetch failed", err);
    first = { ok: false, ct: "", text: "" };
  }

  const primaryLooksHtml = looksLikeHtml(first?.ct, first?.text);
  if (first?.ok && !primaryLooksHtml) {
    return { text: first.text, finalPath: primaryPath, usedFallback: false };
  }

  const cid = baseCidFrom(post.ipfs || primaryPath);
  const fallbackPath = `${cid}/info.yaml`;

  // Avoid infinite loop if primary already was .../info.yaml
  if (fallbackPath === primaryPath) {
    // Primary is bad and already info.yaml — bubble the original content
    if (!first?.ok) throw new Error(`Descriptor fetch failed: ${primaryPath}`);
    if (primaryLooksHtml) throw new Error(`Descriptor is HTML: ${primaryPath}`);
    return { text: first.text, finalPath: primaryPath, usedFallback: false };
  }

  L("fallback to legacy info.yaml", { path: fallbackPath });
  const second = await fetchText(fallbackPath);
  const secondLooksHtml = looksLikeHtml(second?.ct, second?.text);

  if (!second.ok || secondLooksHtml) {
    E("fallback failed", { ok: second.ok, ct: second.ct?.slice(0, 64) });
    // Prefer second error text if present; UI will handle showing a friendly message.
    throw new Error(`Descriptor fetch failed at both paths: ${primaryPath} ; ${fallbackPath}`);
  }

  return { text: second.text, finalPath: fallbackPath, usedFallback: true };
}
