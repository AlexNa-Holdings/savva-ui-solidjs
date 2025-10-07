// src/x/docs/MarkdownView.jsx
import { createEffect, onCleanup, createSignal, onMount } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { dbg } from "../../utils/debug.js";
import { rehypeMediaPlayers } from "../../docs/rehype-media-players.js";
import { rehypeImageSize } from "../../docs/rehype-image-size.js";
import rehypeSlug from "rehype-slug";
import remarkBreaks from "remark-breaks";
import { ImageDecryptionObserver } from "./ImageDecryptionObserver.js";

export default function MarkdownView(props) {
  const app = useApp();
  const { t } = app;
  const [html, setHtml] = createSignal("");
  let disposed = false;
  let container;
  let imageObserver = null;

  const renderMd = async () => {
    if (disposed) return;
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

      // adds a "Copy" button to code blocks
      const rehypeCopyButton = () => (tree) => {
        visit(tree, "element", (node) => {
          if (node.tagName !== "pre" || node.children.some(c => c.properties?.className?.includes("sv-copy-btn"))) return;
          node.children.push({
            type: "element", tagName: "button",
            properties: { className: ["sv-copy-btn"], type: "button" },
            children: [{ type: "text", value: t("clipboard.copy") }],
          });
        });
        return tree;
      };

      DOMPurify.addHook("uponSanitizeElement", (node, data) => {
        if (data.tagName === "iframe" || data.tagName === "video" || data.tagName === "audio") {
          if (!node.hasAttribute("src")) node.remove();
        }
      });

      // build remark → rehype pipeline
      const processor = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkBreaks);

      // optional remark plugins (rarely used today)
      if (props.remarkPlugins) {
        for (const entry of (Array.isArray(props.remarkPlugins) ? props.remarkPlugins : [props.remarkPlugins])) {
          const arr = Array.isArray(entry) ? entry : [entry];
          processor.use(...arr);
        }
      }

      processor.use(remarkRehype, { allowDangerousHtml: true });

      // optional rehype plugins coming from callers (e.g. draft URL resolver)
      if (props.rehypePlugins) {
        for (const entry of (Array.isArray(props.rehypePlugins) ? props.rehypePlugins : [props.rehypePlugins])) {
          const arr = Array.isArray(entry) ? entry : [entry];
          processor.use(...arr);
        }
      }

      processor
        .use(rehypeMediaPlayers)
        .use(rehypeImageSize)
        .use(rehypeSlug)
        .use(rehypeCopyButton)
        .use(rehypeStringify, { allowDangerousHtml: true });

      const file = await processor.process(String(props.markdown || ""));
      const rawHtml = String(file);

      const safe = DOMPurify.sanitize(rawHtml, {
        ADD_TAGS: ["iframe", "video", "audio"],
        ADD_ATTR: ["allowfullscreen", "frameborder", "controls", "style", "src", "width", "height", "title"],
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|ftp|cid|xmpp|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      });

      if (!disposed) setHtml(safe);
    } catch (err) {
      dbg.error("MarkdownView", "Markdown rendering failed:", err);
      const safeErr = String(err?.message || err).replace(/&/g, "&amp;").replace(/</g, "&lt;");
      const errorHtml = `<div style="color: red; border: 1px solid red; padding: 1rem;"><strong>${t("common.error")}:</strong><pre>${safeErr}</pre></div>`;
      if (!disposed) setHtml(errorHtml);
    }
  };

  function copy(text) {
    if (!text) return;
    try { navigator.clipboard.writeText(text); } catch (e) { console.error("Failed to copy text:", e); }
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
    buttons.forEach((btn) => { btn.textContent = t("clipboard.copy"); });
  }

  createEffect(async () => {
    props.markdown;
    props.remarkPlugins;
    props.rehypePlugins;
    await renderMd();
    relabelButtons();

    // Start image decryption observer after content is rendered
    if (container && !imageObserver) {
      imageObserver = new ImageDecryptionObserver(app, container);
      imageObserver.start();
    } else if (imageObserver) {
      // Content changed, re-process images
      imageObserver.processImages();
    }
  });

  onMount(() => container?.addEventListener("click", onClick));
  onCleanup(() => {
    disposed = true;
    container?.removeEventListener("click", onClick);

    // Cleanup image decryption observer
    if (imageObserver) {
      imageObserver.stop();
      imageObserver = null;
    }
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
