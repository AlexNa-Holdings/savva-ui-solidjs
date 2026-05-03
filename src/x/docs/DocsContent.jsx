// src/x/docs/DocsContent.jsx
import { createMemo, createResource, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import MarkdownView from "./MarkdownView.jsx";
import DocsPager from "./DocsPager.jsx";

// Files under `_shared/` (e.g. config examples) live outside lang folders
// because they don't get translated. Fetch them without the lang prefix.
function buildFetchUrl(lang, clean) {
  if (clean.startsWith("_shared/")) return `/dev_docs/${clean}`;
  return `/dev_docs/${lang}/${clean}`;
}

function isMarkdown(name) {
  return /\.(md|markdown)$/i.test(name);
}

function inferCodeLang(name) {
  const stripped = name.replace(/\.example$/i, "");
  const ext = stripped.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  switch (ext) {
    case "yml":
    case "yaml": return "yaml";
    case "json": return "json";
    case "conf":
    case "nginx": return "nginx";
    case "js": return "js";
    case "ts": return "ts";
    case "sh":
    case "bash": return "bash";
    case "sql": return "sql";
    case "toml": return "toml";
    case "ini": return "ini";
    case "xml":
    case "html": return ext;
    default: return ext || "";
  }
}

// Wrap content in a fenced code block, picking a fence longer than any
// backtick run already inside the content so embedded ``` doesn't break out.
function wrapAsCodeBlock(text, lang) {
  const longest = (text.match(/`+/g) || []).reduce((m, s) => Math.max(m, s.length), 0);
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${lang}\n${text}\n${fence}`;
}

function basename(p) {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

async function fetchMd({ lang, relPath }) {
  const clean = String(relPath || "index.md").replace(/^\/*/, "");
  const res = await fetch(buildFetchUrl(lang, clean), { cache: "no-store" });
  if (!res.ok) return { ok: false, text: `# 404\n\n/dev_docs/${clean}` };
  const text = await res.text();

  if (isMarkdown(clean)) return { ok: true, text };

  // Non-markdown: render as a fenced code block under a filename heading.
  const name = basename(clean);
  const code = wrapAsCodeBlock(text, inferCodeLang(name));
  return { ok: true, text: `# ${name}\n\n${code}` };
}

export default function DocsContent(props) {
  const app = useApp();
  const lang = createMemo(() => (app.lang?.() || "en").toLowerCase());
  const params = createMemo(() => ({ lang: lang(), relPath: props.relPath }));
  const [doc] = createResource(params, fetchMd);

  return (
    <div class="p-4">
      <Show when={!doc.loading} fallback={
        <div class="text-sm text-[hsl(var(--muted-foreground))]">{app.t("common.loading")}</div>
      }>
        <MarkdownView markdown={doc()?.text || ""} />
        <DocsPager activeRelPath={props.relPath} onPick={props.onPick} />
      </Show>
    </div>
  );
}
