// src/components/docs/rehype-resolve-draft-urls.js
import { visit } from "unist-util-visit";
import { resolveDraftFileUrl } from "../editor/storage.js";
import { dbg } from "../utils/debug.js";

// A very small guard to avoid double-work and malformed inputs
const isRelative = (url) => typeof url === "string" && !/^(#|\/|[a-z]+:)/i.test(url);

/**
 * Resolve relative media URLs (img/video/audio + <a>) to blob: URLs from the
 * editor draft storage. Designed to be robust in async pipelines.
 *
 * Usage: pass the FACTORY (this function) to the unified pipeline, not the result.
 */
export function rehypeResolveDraftUrls() {
  return async (tree) => {
    if (!tree || typeof tree !== "object") {
      dbg.error("PreviewResolver", "Received invalid tree; skipping URL resolution.");
      return tree;
    }

    dbg.log("PreviewResolver", "Resolving draft media URLs...");

    const tasks = [];

    visit(tree, "element", (node) => {
      // media tags
      if (node.tagName === "img" || node.tagName === "video" || node.tagName === "audio") {
        const src = node.properties?.src;
        if (isRelative(src)) {
          tasks.push(
            (async () => {
              const blobUrl = await resolveDraftFileUrl(src);
              if (blobUrl) node.properties.src = blobUrl;
            })()
          );
        }
      }

      // links to local files (let users link to attachments)
      if (node.tagName === "a") {
        const href = node.properties?.href;
        if (isRelative(href)) {
          tasks.push(
            (async () => {
              const blobUrl = await resolveDraftFileUrl(href);
              if (blobUrl) node.properties.href = blobUrl;
            })()
          );
        }
      }
    });

    if (tasks.length) {
      await Promise.allSettled(tasks);
      dbg.log("PreviewResolver", `Resolved ${tasks.length} URL(s) from draft storage`);
    }

    return tree;
  };
}
