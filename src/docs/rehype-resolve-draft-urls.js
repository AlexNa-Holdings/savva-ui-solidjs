// src/docs/rehype-resolve-draft-urls.js
import { visit } from "unist-util-visit";
import { resolveDraftFileUrl } from "../editor/storage.js";
import { dbg } from "../utils/debug.js";

const isRelative = (url) => typeof url === "string" && !/^(#|\/|[a-z]+:)/i.test(url);

/**
 * A rehype plugin factory. The plugin resolves relative media URLs 
 * from the specified draft storage directory.
 * @param {object} [options={}] - The options object.
 * @param {string} options.baseDir - The base draft directory (e.g., "new_post").
 */
export function rehypeResolveDraftUrls(options = {}) {
  const baseDir = options.baseDir;
  return async (tree) => {
    if (!tree || typeof tree !== "object" || !baseDir) {
      dbg.warn("PreviewResolver", "Invalid tree or missing baseDir; skipping URL resolution.");
      return tree;
    }

    const tasks = [];

    visit(tree, "element", (node) => {
      const prop = (node.tagName === 'a') ? 'href' : 'src';
      if (node.properties && prop in node.properties) {
        const url = node.properties[prop];
        if (isRelative(url)) {
          tasks.push(
            (async () => {
              const blobUrl = await resolveDraftFileUrl(baseDir, url);
              if (blobUrl) node.properties[prop] = blobUrl;
            })()
          );
        }
      }
    });

    if (tasks.length) {
      await Promise.allSettled(tasks);
    }

    return tree;
  };
}