// src/components/docs/MarkdownView.jsx
import { createEffect, on, onCleanup, createSignal, onMount } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { dbg } from "../../utils/debug.js";
import { rehypeMediaPlayers } from "./rehype-media-players.js";

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
        { default: remarkFrontmatter }, { default: remarkRehype }, { default: rehypeSlug }, 
        { default: rehypeAutolinkHeadings }, { default: rehypePrettyCode }, 
        { default: rehypeStringify }, DOMPurify, { default: remarkBreaks },
      ] = await Promise.all([
        import("unified"), import("remark-parse"), import("remark-gfm"),
        import("remark-frontmatter"), import("remark-rehype"), import("rehype-slug"),
        import("rehype-autolink-headings"), import("rehype-pretty-code"),
        import("rehype-stringify"), import("dompurify"), import("remark-breaks"),
      ]);

      // Allow specific tags and attributes for media players
      DOMPurify.default.addHook("uponSanitizeElement", (node, data) => {
        if (data.tagName === 'iframe' || data.tagName === 'video' || data.tagName === 'audio') {
            if(!node.hasAttribute('src')) node.remove();
        }
      });

      const processor = unified()
        .use(remarkParse)
        .use(remarkBreaks)
        .use(remarkFrontmatter, ["yaml", "toml"])
        .use(remarkGfm)
        .use(remarkRehype, { allowDangerousHtml: true })
        .use(rehypeMediaPlayers) // Our new media plugin
        .use(rehypeSlug)
        .use(rehypeAutolinkHeadings, { behavior: "wrap" })
        .use(rehypePrettyCode, {
          keepBackground: true,
          theme: { light: "github-light", dark: "github-dark" },
        })
        .use(rehypeCopyButton)
        .use(rehypeStringify, { allowDangerousHtml: true });
      
      const file = await processor.process(String(props.markdown || ""));
      const rawHtml = String(file);
      
      const safe = DOMPurify.default.sanitize(rawHtml, {
        ADD_TAGS: ["iframe", "video", "audio"],
        ADD_ATTR: ["allowfullscreen", "frameborder", "controls", "style", "src"],
        // Allow specific youtube domain for iframes
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|ftp|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
        FORBID_TAGS: [],
        FORBID_ATTR: []
      });

      if (!disposed) setHtml(safe);
    } catch (err) {
      dbg.error("MarkdownView", "Markdown rendering failed:", err);
      const safeErr = String(err?.message || err).replace(/&/g, "&amp;").replace(/</g, "&lt;");
      const safeMd = String(props.markdown || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
      
      const errorHtml = `
        <div style="color: hsl(var(--destructive)); border: 1px solid hsl(var(--destructive)); padding: 1rem; border-radius: 0.5rem;">
          <strong>Markdown Rendering Error:</strong>
          <pre style="margin-top: 0.5rem; white-space: pre-wrap;">${safeErr}</pre>
          <hr style="margin: 1rem 0;" />
          <strong>Original Content:</strong>
          <pre style="white-space: pre-wrap;">${safeMd}</pre>
        </div>`;
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
    
    // Select the code content, excluding the button itself
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

  createEffect(on(() => props.markdown, (md, prevMd) => {
    if (md !== prevMd && prevMd !== undefined) {
      renderMd().then(() => relabelButtons());
    }
  }, { defer: true }));

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
