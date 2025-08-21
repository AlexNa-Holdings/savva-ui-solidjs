// src/components/docs/DocsPager.jsx
import { createMemo, createResource, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

async function fetchSidebar(lang) {
  const res = await fetch(`/dev_docs/${lang}/sidebar.yaml`, { cache: "no-store" });
  if (!res.ok) return { sections: [] };
  const text = await res.text();
  try {
    const y = (await import("js-yaml")).default.load(text) || {};
    if (Array.isArray(y.sections)) return { sections: y.sections };
    if (Array.isArray(y.items)) return { sections: [{ title: "Docs", items: y.items }] };
    if (Array.isArray(y)) return { sections: [{ title: "Docs", items: y }] };
  } catch {}
  return { sections: [] };
}

export default function DocsPager(props) {
  const app = useApp();
  const lang = createMemo(() => (app.lang?.() || "en").toLowerCase());
  const [data] = createResource(lang, fetchSidebar);

  const flat = createMemo(() => {
    const sections = data()?.sections || [];
    const items = [];
    sections.forEach((s) => (s.items || []).forEach((it) => {
      const label = it.label || it.title || it.file || "";
      const file  = it.file || it.path  || "";
      if (file) items.push({ label, file, section: s.title || "" });
    }));
    return items;
  });

  const nav = createMemo(() => {
    const list = flat();
    const idx = list.findIndex((x) => String(x.file) === String(props.activeRelPath || ""));
    if (idx < 0) return { prev: null, next: null };
    return { prev: list[idx - 1] || null, next: list[idx + 1] || null };
  });

  const go = (file) => props.onPick?.(file);

  return (
    <Show when={!data.loading && (nav().prev || nav().next)}>
      <nav class="mt-8 pt-4 border-t border-[hsl(var(--border))] flex items-stretch justify-between gap-3 text-sm">
        {/* Prev */}
        <div class="min-w-0 flex-1">
          <Show when={nav().prev}>
            {(p) => (
              <button
                type="button"
                class="w-full rounded-md px-3 py-2 bg-[hsl(var(--muted))] hover:bg-[hsl(var(--accent))] text-left"
                onClick={() => go(p().file)}
                aria-label={app.t("docs.prev")}
                title={app.t("docs.prev")}
              >
                <div class="opacity-70">{app.t("docs.prev")} · {p().section}</div>
                <div class="truncate flex items-center gap-2">
                  <span aria-hidden="true">←</span>
                  <span class="font-medium">{p().label}</span>
                </div>
              </button>
            )}
          </Show>
        </div>

        {/* Next */}
        <div class="min-w-0 flex-1 text-right">
          <Show when={nav().next}>
            {(n) => (
              <button
                type="button"
                class="w-full rounded-md px-3 py-2 bg-[hsl(var(--muted))] hover:bg-[hsl(var(--accent))] text-right"
                onClick={() => go(n().file)}
                aria-label={app.t("docs.next")}
                title={app.t("docs.next")}
              >
                <div class="opacity-70">{app.t("docs.next")} · {n().section}</div>
                <div class="truncate flex items-center gap-2 justify-end">
                  <span class="font-medium">{n().label}</span>
                  <span aria-hidden="true">→</span>
                </div>
              </button>
            )}
          </Show>
        </div>
      </nav>
    </Show>
  );
}
