// src/components/post/PostTags.jsx
import { createMemo, For, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

function Pill(props) {
  return (
    <div class="px-2.5 py-1 rounded-md bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] text-xs font-medium">
      {props.children}
    </div>
  );
}

export default function PostTags(props) {
  const app = useApp();
  const lang = () => (app.lang?.() || "en").toLowerCase();

  // locales[lang] with sensible fallbacks
  const L = createMemo(() => {
    const locales = props.postData?.savva_content?.locales || {};
    return locales[lang()] || locales.en || locales[Object.keys(locales)[0]] || null;
  });

  const categories = createMemo(() => (Array.isArray(L()?.categories) ? L().categories : []));
  const tags = createMemo(() => (Array.isArray(L()?.tags) ? L().tags : []));

  return (
    <Show when={categories().length > 0 || tags().length > 0}>
      <div class="flex flex-col gap-1 pt-1">
        {/* line 1: Categories */}
        <Show when={categories().length > 0}>
          <div class="flex flex-wrap items-center gap-2">
            <For each={categories()}>{(c) => <Pill>{c}</Pill>}</For>
          </div>
        </Show>

        {/* line 2: Tags */}
        <Show when={tags().length > 0}>
          <div class="flex flex-wrap items-center gap-2">
            <For each={tags()}>{(t) => <Pill>{t}</Pill>}</For>
          </div>
        </Show>
      </div>
    </Show>
  );
}
