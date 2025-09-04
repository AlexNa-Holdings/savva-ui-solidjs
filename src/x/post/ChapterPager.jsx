// src/x/post/ChapterPager.jsx
import { createMemo, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

export default function ChapterPager(props) {
  const { t } = useApp();

  const nav = createMemo(() => {
    const list = props.chapters || [];
    const idx = props.currentIndex;
    if (idx < 0 || list.length === 0) return { prev: null, next: null };
    
    const prev = list[idx - 1] ? { ...list[idx - 1], index: idx - 1 } : null;
    const next = list[idx + 1] ? { ...list[idx + 1], index: idx + 1 } : null;
    
    return { prev, next };
  });
  
  const go = (index) => props.onSelect?.(index);

  return (
    <Show when={nav().prev || nav().next}>
      <nav class="mt-8 pt-4 border-t border-[hsl(var(--border))] flex items-stretch justify-between gap-3 text-sm">
        {/* Prev (left) */}
        <div class="min-w-0 flex-1">
          <Show when={nav().prev}>
            {(p) => (
              <button
                type="button"
                class="w-full rounded-md px-3 py-2 bg-[hsl(var(--muted))] hover:bg-[hsl(var(--accent))] text-left"
                onClick={() => go(p().index)}
                aria-label={t("docs.prev")}
                title={p().title}
              >
                <div class="flex items-start gap-2">
                  <span aria-hidden="true">←</span>
                  <div class="min-w-0">
                    <div class="font-medium whitespace-normal break-words leading-snug">
                      {p().index > 0 ? `${p().index}. ${p().title}` : p().title}
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
                onClick={() => go(n().index)}
                aria-label={t("docs.next")}
                title={n().title}
              >
                <div class="flex items-start gap-2 justify-end">
                  <div class="min-w-0">
                    <div class="font-medium whitespace-normal break-words leading-snug text-right">
                      {n().index > 0 ? `${n().index}. ${n().title}` : n().title}
                    </div>
                  </div>
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