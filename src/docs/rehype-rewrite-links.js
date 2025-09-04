// src/x/docs/rehype-rewrite-links.js
import { visit } from "unist-util-visit";

/**
 * A rehype plugin that rewrites relative image and link URLs to be absolute,
 * based on a provided base URL.
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
      if (node.tagName === 'a' || node.tagName === 'img') {
        const prop = node.tagName === 'a' ? 'href' : 'src';
        const url = node.properties?.[prop];
        if (typeof url === 'string' && isRelative(url)) {
          node.properties[prop] = base + url;
        }
      }
    });

    return tree;
  };
}