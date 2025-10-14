// src/x/docs/rehype-rewrite-links.js
import { visit } from "unist-util-visit";

/**
 * A rehype plugin that rewrites relative URLs to be absolute,
 * based on a provided base URL.
 * Handles <a> href, <img> src, <video> src, and <audio> src attributes.
 * @param {object} options - The options object.
 * @param {string} options.base - The base URL to prepend to relative paths.
 */
export function rehypeRewriteLinks(options = {}) {
  return (tree) => {
    // FIX: Always return the tree, even if there's no base URL.
    if (!options.base) {
      return tree;
    }
    
    const base = options.base.endsWith('/') ? options.base : `${options.base}/`;
    const isRelative = (url) => !/^(#|\/|[a-z]+:)/i.test(url);
    
    visit(tree, "element", (node) => {
      // Handle links
      if (node.tagName === 'a') {
        const url = node.properties?.href;
        if (typeof url === 'string' && isRelative(url)) {
          node.properties.href = base + url;
        }
      }
      // Handle images, videos, and audio elements
      else if (node.tagName === 'img' || node.tagName === 'video' || node.tagName === 'audio') {
        const url = node.properties?.src;
        if (typeof url === 'string' && isRelative(url)) {
          node.properties.src = base + url;
        }
      }
    });

    return tree;
  };
}