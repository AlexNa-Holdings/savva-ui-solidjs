// src/utils/assetLoader.js
import { parse } from "yaml";
import { fetchWithTimeout } from "./net";

/**
 * Load a resource from the active domain assets (or domain_default fallback).
 * @param {object} app useApp() context
 * @param {string} relPath relative path inside the asset pack (e.g. "tabs.yaml")
 * @param {object} opts { type: "yaml"|"json"|"text", timeoutMs?: number }
 */
export async function loadAssetResource(app, relPath, opts = {}) {
  const url = app.assetUrl(relPath);
  const timeoutMs = opts.timeoutMs || 8000;
  const res = await fetchWithTimeout(url, { timeoutMs });

  if (!res.ok) {
    throw new Error(`Asset fetch failed: ${url} (${res.status})`);
  }

  const text = await res.text();

  switch (opts.type) {
    case "yaml":
      return parse(text) || null;
    case "json":
      return JSON.parse(text);
    case "text":
    default:
      return text;
  }
}
