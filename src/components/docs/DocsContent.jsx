// src/components/docs/DocsContent.jsx
import { createMemo, createResource, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import MarkdownView from "./MarkdownView.jsx";
import DocsPager from "./DocsPager.jsx";

async function fetchMd({ lang, relPath }) {
  const clean = String(relPath || "index.md").replace(/^\/*/, "");
  const res = await fetch(`/dev_docs/${lang}/${clean}`, { cache: "no-store" });
  if (!res.ok) return { ok: false, text: `# 404\n\n/dev_docs/${lang}/${clean}` };
  return { ok: true, text: await res.text() };
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
        {/* Pager */}
        <DocsPager activeRelPath={props.relPath} onPick={props.onPick} />
      </Show>
    </div>
  );
}
