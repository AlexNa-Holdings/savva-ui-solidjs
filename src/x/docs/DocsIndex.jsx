// src/x/docs/DocsIndex.jsx
import { createMemo, createResource, For, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

async function fetchSidebar(lang) {
  // Expected: public/dev_docs/<lang>/sidebar.yaml
  const res = await fetch(`/dev_docs/${lang}/sidebar.yaml`, { cache: "no-store" });
  if (!res.ok) return { sections: [] };
  const text = await res.text();
  // very small YAML reader to avoid extra deps:
  // supports:
  // sections:
  //   - title: ...
  //     items: [{label,file}, ...]
  try {
    const y = (await import("js-yaml")).default.load(text) || {};
    if (Array.isArray(y.sections)) return { sections: y.sections };
    if (Array.isArray(y.items)) return { sections: [{ title: "Docs", items: y.items }] };
    if (Array.isArray(y)) return { sections: [{ title: "Docs", items: y }] };
  } catch {}
  return { sections: [] };
}

export default function DocsIndex(props) {
  const app = useApp();
  const lang = createMemo(() => (app.lang?.() || "en").toLowerCase());
  const [data] = createResource(lang, fetchSidebar);

  const item = (it) => {
    const label = it.label || it.title || it.file || "";
    const file  = it.file || it.path  || "";
    const active = () => props.active === file;
    return (
      <button
        class={`w-full text-left px-3 py-2 text-sm rounded ${
          active() ? "bg-[hsl(var(--accent))]" : "hover:bg-[hsl(var(--accent))]"
        }`}
        onClick={() => props.onPick?.(file)}
        title={label}
        type="button"
      >
        {label}
      </button>
    );
  };

  return (
    <div class="py-2">
      <Show when={!data.loading} fallback={
        <div class="px-3 py-2 text-sm text-[hsl(var(--muted-foreground))]">{app.t("common.loading")}</div>
      }>
        <For each={data()?.sections || []}>
          {(sec, index) => (
            <div class="mb-2">
              <h2 class="px-3 pb-1 pt-2 text-sm font-semibold tracking-wide text-[hsl(var(--card-foreground))]">
                {`${index() + 1}. ${sec.title || app.t("docs.section")}`}
              </h2>
              <For each={sec.items || []}>{item}</For>
            </div>
          )}
        </For>
        <Show when={!data() || (data()?.sections || []).length === 0}>
          <div class="px-3 py-2 text-sm text-[hsl(var(--muted-foreground))]">
            {app.t("docs.sidebar.empty")}
          </div>
        </Show>
      </Show>
    </div>
  );
}
