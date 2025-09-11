// src/ipfs/fetchDescriptorWithFallback.js
import { dbg } from "../utils/debug.js";
import { ipfs } from "./index.js";
import { parse } from "yaml";

function looksLikeHtml(contentType, textSample) {
  if (contentType && /html/i.test(contentType)) return true;
  const s = String(textSample || "")
    .trim()
    .slice(0, 200);
  return /^<!doctype html/i.test(s) || /^<html[\s>]/i.test(s);
}

function baseCidFrom(pathOrCid) {
  const s = String(pathOrCid || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  return s.split("/")[0].replace(/^ipfs\//, "");
}

/**
 * Fetches and parses a post's descriptor, handling modern and legacy formats by attempting to fetch.
 * @param {object} app - The main application context.
 * @param {object} post - The raw post object from the API.
 * @returns {Promise<{descriptor: object, finalPath: string}>} A promise resolving to the parsed descriptor and the actual path used.
 */
export async function fetchDescriptorWithFallback(app, post) {
  const primaryPath = post.ipfs;
  if (!primaryPath) throw new Error("Post has no IPFS path.");

  // Attempt 1: Fetch the path directly from the `ipfs` field.
  try {
    const { res } = await ipfs.fetchBest(app, primaryPath);
    const contentType = res.headers?.get("content-type") || "";
    const text = await res.text();

    if (!looksLikeHtml(contentType, text)) {
      const descriptor = parse(text);
      if (descriptor) {
        post.finalDescriptorPath = primaryPath; // Cache for later use
        return { descriptor, finalPath: primaryPath }; // Success with modern format
      }
    }
  } catch (e) {
    dbg.warn(
      "fetchDescriptor",
      `Primary fetch for ${primaryPath} failed, trying fallback.`,
      e
    );
  }

  // Attempt 2 (Fallback): Treat the initial path as a folder CID and append /info.yaml
  const fallbackPath = `${baseCidFrom(primaryPath)}/info.yaml`;
  dbg.log("fetchDescriptor", `Falling back to legacy path: ${fallbackPath}`);

  try {
    const { res } = await ipfs.fetchBest(app, fallbackPath);
    const text = await res.text();
    const descriptor = parse(text);
    if (descriptor) {
      post.finalDescriptorPath = fallbackPath; // Cache for later use
      return { descriptor, finalPath: fallbackPath }; // Success with legacy format
    }

    throw new Error("Fallback path did not contain valid YAML.");
  } catch (err) {
    throw new Error(
      `Failed to fetch/parse descriptor from both primary and fallback paths. Last error: ${err.message}`
    );
  }
}
