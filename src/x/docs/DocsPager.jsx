// src/x/docs/DocsPager.jsx
import { createMemo, createResource, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { ArrowLeftIcon, ArrowRightIcon } from "../ui/icons/ArrowIcons.jsx";

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
        {/* Prev (left) */}
        <div class="min-w-0 flex-1">
          <Show when={nav().prev}>
            {(p) => (
              <button
                type="button"
                class="w-full rounded-md px-3 py-2 bg-[hsl(var(--muted))] hover:bg-[hsl(var(--accent))] text-left"
                onClick={() => go(p().file)}
                aria-label={app.t("docs.prev")}
                title={p().label}
              >
                <div class="flex items-center gap-2">
                  <ArrowLeftIcon class="w-6 h-6 shrink-0" />
                  <div class="min-w-0">
                    <div class="font-medium whitespace-normal break-words leading-snug">
                      {p().label}
                    </div>
                    <div class="opacity-70 text-xs whitespace-normal break-words leading-snug">
                      {p().section}
                    </div>
                  </div>
                </div>
              </button>
            )}
          </Show>
        </div>

        {/* Next (right) */}
        <div class="min-w-0 flex-1 text-right">
          <Show when={nav().next}>
            {(n) => (
              <button
                type="button"
                class="w-full rounded-md px-3 py-2 bg-[hsl(var(--muted))] hover:bg-[hsl(var(--accent))]"
                onClick={() => go(n().file)}
                aria-label={app.t("docs.next")}
                title={n().label}
              >
                <div class="flex items-center gap-2 justify-end">
                  <div class="min-w-0">
                    <div class="font-medium whitespace-normal break-words leading-snug text-right">
                      {n().label}
                    </div>
                    <div class="opacity-70 text-xs whitespace-normal break-words leading-snug text-right">
                      {n().section}
                    </div>
                  </div>
                  <ArrowRightIcon class="w-6 h-6 shrink-0" />
                </div>
              </button>
            )}
          </Show>
        </div>
      </nav>
    </Show>
  );
}
