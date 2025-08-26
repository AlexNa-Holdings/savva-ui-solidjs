// src/components/docs/rehype-resolve-draft-urls.js
import { visit } from "unist-util-visit";
import { resolveDraftFileUrl } from "../../editor/storage.js";
import { dbg } from "../../utils/debug.js";

const isRelative = (url) => !/^(#|\/|[a-z]+:)/i.test(url);

export function rehypeResolveDraftUrls() {
  return async (tree) => {
    dbg.log("PreviewResolver", "Resolving draft media URLs...");
    const nodesToUpdate = [];
    visit(tree, "element", (node) => {
      if (node.tagName === 'img' || node.tagName === 'video' || node.tagName === 'audio') {
        const url = node.properties?.src;
        if (typeof url === 'string' && isRelative(url)) {
          nodesToUpdate.push({ node, url });
        }
      }
    });

    if (nodesToUpdate.length > 0) {
      dbg.log("PreviewResolver", `Found ${nodesToUpdate.length} relative media URLs to resolve.`);
      await Promise.all(
        nodesToUpdate.map(async ({ node, url }) => {
          const blobUrl = await resolveDraftFileUrl(url);
          dbg.log("PreviewResolver", `Resolving '${url}' -> '${blobUrl}'`);
          if (blobUrl) {
            node.properties.src = blobUrl;
          }
        })
      );
    }
  };
}