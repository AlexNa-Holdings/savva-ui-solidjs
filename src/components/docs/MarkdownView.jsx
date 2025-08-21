// src/components/docs/MarkdownView.jsx
import { createSignal, onMount, onCleanup } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

/* Inject a copy button into each <pre> before stringify */
function rehypeCopyButton() {
  return (tree) =>
    import("unist-util-visit").then(({ visit }) => {
      visit(tree, "element", (node) => {
        if (node.tagName !== "pre") return;
        const exists =
          Array.isArray(node.children) &&
          node.children.some(
            (c) =>
              c?.type === "element" &&
              c?.properties?.className?.includes?.("sv-copy-btn")
          );
        if (exists) return;
        node.children.push({
          type: "element",
          tagName: "button",
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
        { unified },
        { default: remarkParse },
        { default: remarkGfm },
        { default: remarkFrontmatter },
        { default: remarkRehype },
        { default: rehypeSlug },
        { default: rehypeAutolinkHeadings },
        { default: rehypePrettyCode },
        { default: rehypeStringify },
        DOMPurify,
      ] = await Promise.all([
        import("unified"),
        import("remark-parse"),
        import("remark-gfm"),
        import("remark-frontmatter"),
        import("remark-rehype"),
        import("rehype-slug"),
        import("rehype-autolink-headings"),
        import("rehype-pretty-code"),
        import("rehype-stringify"),
        import("dompurify"),
      ]);

      // Preserve Shiki styles: allow CSS variables and var() uses on style attrs
      DOMPurify.default.addHook("uponSanitizeAttribute", (node, data) => {
        if (data.attrName !== "style") return;
        const src = String(data.attrValue || "");
        const safe = [];
        for (const decl of src.split(";")) {
          const i = decl.indexOf(":");
          if (i <= 0) continue;
          const prop = decl.slice(0, i).trim().toLowerCase();
          const val = decl.slice(i + 1).trim();
          const isVarDecl = prop.startsWith("--"); // e.g., --shiki-*
          const isVarUse = /^var\(/i.test(val);
          const isColorProp =
            prop === "color" ||
            prop === "background" ||
            prop === "background-color";
          if (isVarDecl || isVarUse || isColorProp) safe.push(`${prop}:${val}`);
        }
        data.attrValue = safe.join(";");
        if (data.attrValue) data.keepAttr = true;
      });

      const processor = unified()
        .use(remarkParse)
        .use(remarkFrontmatter, ["yaml", "toml"])
        .use(remarkGfm)
        .use(remarkRehype, { allowDangerousHtml: true })
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
        USE_PROFILES: { html: true },
        ADD_ATTR: ["style", "data-theme", "data-language", "data-line"],
        ALLOW_DATA_ATTR: true,
      });

      if (!disposed) setHtml(safe);
    } catch {
      const safe = `<pre>${String(props.markdown || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")}</pre>`;
      if (!disposed) setHtml(safe);
    }
  }

  function copy(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    return new Promise((res, rej) => {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        res();
      } catch (e) {
        rej(e);
      }
    });
  }

  function onClick(e) {
    const btn = e.target.closest?.(".sv-copy-btn");
    if (!btn) return;
    const code = btn.closest("pre")?.querySelector("code");
    const text = code ? code.innerText : "";
    copy(text).then(() => {
      const prev = btn.textContent;
      btn.textContent = t("docs.copied") || "Copied";
      setTimeout(() => {
        btn.textContent = t("docs.copy") || prev || "Copy";
      }, 1200);
    });
  }

  function relabelButtons() {
    container?.querySelectorAll(".sv-copy-btn").forEach((b) => {
      b.textContent = t("docs.copy") || "Copy";
      b.title = t("docs.copy") || "Copy";
      b.setAttribute("aria-label", t("docs.copy") || "Copy");
    });
  }

  onMount(async () => {
    await renderMd();
    relabelButtons();
    container?.addEventListener("click", onClick);
  });

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
