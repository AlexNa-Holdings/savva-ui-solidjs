// src/docs/rehype-image-size.js
import { visit } from "unist-util-visit";

// Parses "300x200", "300x", "x200", "w=300", "h=50%", "width=320", "height=auto"
function parseSizeTokens(title = "") {
  if (!title || typeof title !== "string") return { width: null, height: null, rest: "" };

  const tokens = title.trim().split(/\s+/);
  let width = null, height = null;
  const rest = [];

  const toCss = (v) => {
    const s = String(v).trim();
    if (s.toLowerCase() === "auto") return "auto";
    return /[a-z%]$/i.test(s) ? s : `${s}px`;
  };

  for (const tok of tokens) {
    let m;
    if ((m = tok.match(/^(\d+(?:\.\d+)?(?:px|%|rem|em|vh|vw)?)x(\d+(?:\.\d+)?(?:px|%|rem|em|vh|vw|auto)?)$/i))) {
      width = toCss(m[1]);
      height = toCss(m[2]);
      continue;
    }
    if ((m = tok.match(/^(\d+(?:\.\d+)?(?:px|%|rem|em|vh|vw)?)x$/i))) {
      width = toCss(m[1]);
      continue;
    }
    if ((m = tok.match(/^[x×](\d+(?:\.\d+)?(?:px|%|rem|em|vh|vw|auto)?)$/i))) {
      height = toCss(m[1]);
      continue;
    }
    if ((m = tok.match(/^w(?:idth)?[:=](.+)$/i))) {
      width = toCss(m[1]);
      continue;
    }
    if ((m = tok.match(/^h(?:eight)?[:=](.+)$/i))) {
      height = toCss(m[1]);
      continue;
    }
    rest.push(tok);
  }

  return { width, height, rest: rest.join(" ") };
}

export function rehypeImageSize() {
  return (tree) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "img") return;
      const title = node.properties?.title || "";
      const { width, height, rest } = parseSizeTokens(title);

      if (!width && !height) return;

      if (rest) node.properties.title = rest;
      else delete node.properties.title;

      const prev = (node.properties.style || "").toString().trim();
      const pieces = [];
      if (prev) pieces.push(prev);
      if (width) pieces.push(`width:${width}`);
      if (height) pieces.push(`height:${height}`);
      if (width && !height) pieces.push("height:auto");
      pieces.push("max-width:100%");

      node.properties.style = pieces.join(";") + ";";

      // Duplicate to attributes when simple numeric px values (optional)
      if (/^\d+px$/.test(width || "")) node.properties.width = parseInt(width, 10);
      if (/^\d+px$/.test(height || "")) node.properties.height = parseInt(height, 10);
    });
    return tree;
  };
}
