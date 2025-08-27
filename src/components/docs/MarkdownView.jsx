// src/components/docs/MarkdownView.jsx
import { createEffect, on, onCleanup, createSignal, onMount } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { dbg } from "../../utils/debug.js";
import { rehypeMediaPlayers } from "../../docs/rehype-media-players.js";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrettyCode from "rehype-pretty-code";
import remarkBreaks from "remark-breaks";

function rehypeCopyButton() {
  return (tree) =>
    import("unist-util-visit").then(({ visit }) => {
      visit(tree, "element", (node) => {
        if (node.tagName !== "pre") return;
        if (node.children.some((c) => c?.properties?.className?.includes?.("sv-copy-btn"))) return;
        node.children.push({
          type: "element", tagName: "button",
          properties: { className: ["sv-copy-btn"], type: "button" },
          children: [{ type: "text", value: "Copy" }],
        });
      });
      return tree;
    });
}

export default function MarkdownView(props) {
  const { t } = useApp();
  const [html, setHtml] = createSignal("");
  let disposed = false;
  let container;

  async function renderMd() {
    try {
      const [
        { unified }, { default: remarkParse }, { default: remarkGfm },
        { default: remarkRehype }, { default: rehypeStringify }, { default: DOMPurify },
        { visit }
      ] = await Promise.all([
        import("unified"), import("remark-parse"), import("remark-gfm"),
        import("remark-rehype"), import("rehype-stringify"), import("dompurify"),
        import("unist-util-visit")
      ]);
  
      const rehypeCopyButton = () => (tree) => {
        visit(tree, "element", (node) => {
          if (node.tagName !== "pre" || node.children.some(c => c.properties?.className?.includes("sv-copy-btn"))) return;
          node.children.push({
            type: "element", tagName: "button",
            properties: { className: ["sv-copy-btn"], type: "button" },
            children: [{ type: "text", value: "Copy" }],
          });
        });
        return tree;
      };
      
      DOMPurify.addHook("uponSanitizeElement", (node, data) => {
        if (data.tagName === 'iframe' || data.tagName === 'video' || data.tagName === 'audio') {
          if (!node.hasAttribute('src')) node.remove();
        }
      });
  
      const processor = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkBreaks)
        .use(remarkRehype, { allowDangerousHtml: true });
  
      if (props.rehypePlugins) {
        for (const plugin of props.rehypePlugins) {
          // This robustly handles both [plugin, options] and just plugin
          processor.use(...(Array.isArray(plugin) ? plugin : [plugin]));
        }
      }
  
      processor
        .use(rehypeMediaPlayers)
        .use(rehypeSlug)
        .use(rehypeCopyButton)
        .use(rehypeStringify, { allowDangerousHtml: true });
  
      const file = await processor.process(String(props.markdown || ""));
      const rawHtml = String(file);
      
      const safe = DOMPurify.sanitize(rawHtml, {
        ADD_TAGS: ["iframe", "video", "audio"],
        ADD_ATTR: ["allowfullscreen", "frameborder", "controls", "style", "src"],
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|ftp|cid|xmpp|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      });
  
      if (!disposed) setHtml(safe);
  
    } catch (err) {
      dbg.error("MarkdownView", "Markdown rendering failed:", err);
      const safeErr = String(err?.message || err).replace(/&/g, "&amp;").replace(/</g, "&lt;");
      const errorHtml = `<div style="color: red; border: 1px solid red; padding: 1rem;"><strong>Error:</strong><pre>${safeErr}</pre></div>`;
      if (!disposed) setHtml(errorHtml);
    }
  }

  function copy(text) {
    if (!text) return;
    try {
      navigator.clipboard.writeText(text);
    } catch (e) {
      console.error("Failed to copy text:", e);
    }
  }

  function onClick(e) {
    const btn = e.target.closest(".sv-copy-btn");
    if (!btn) return;
    const pre = btn.closest("pre");
    if (!pre) return;

    const codeNode = pre.querySelector("code");
    if (codeNode) {
      copy(codeNode.innerText);
      btn.textContent = t("clipboard.copied");
      setTimeout(() => { btn.textContent = t("clipboard.copy"); }, 2000);
    }
  }

  function relabelButtons() {
    if (!container) return;
    const buttons = container.querySelectorAll(".sv-copy-btn");
    buttons.forEach(btn => { btn.textContent = t("clipboard.copy"); });
  }

  onMount(() => {
    renderMd().then(() => relabelButtons());
    container?.addEventListener("click", onClick);
  });

  // MODIFICATION: Removed { defer: true } to make updates immediate.
  createEffect(on(() => props.markdown, (md, prevMd) => {
    if (md !== prevMd && prevMd !== undefined) {
      renderMd().then(() => relabelButtons());
    }
  }));

  onCleanup(() => {
    disposed = true;
    container?.removeEventListener("click", onClick);
  });

  return (
    <article
      ref={(el) => (container = el)}
      class="sv-docs prose prose-sm md:prose-base max-w-none"
      innerHTML={html()}
      aria-label={t("docs.article")}
    />
  );
}
