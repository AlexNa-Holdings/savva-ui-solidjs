// src/components/feed/ContentFeed.jsx
import { createSignal, onCleanup, onMount, For, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import IpfsImage from "../ui/IpfsImage.jsx";

export default function ContentFeed(props) {
  const { t } = useApp();
  const mode = () => (props.mode === "grid" ? "grid" : "list");
  const [items, setItems] = createSignal([]);
  const [page, setPage] = createSignal(0);
  const [hasMore, setHasMore] = createSignal(true);
  const [loading, setLoading] = createSignal(false);
  let sentinel;

  async function loadMore() {
    if (loading() || !hasMore()) return;
    setLoading(true);
    try {
      const nextPage = page() + 1;
      const chunk = (await props.fetchPage?.(nextPage, props.pageSize || 12)) ?? [];
      if (!chunk.length) setHasMore(false);
      setItems((prev) => prev.concat(chunk));
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }

  onMount(() => {
    loadMore();
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && loadMore()),
      { rootMargin: "600px 0px 600px 0px" }
    );
    if (sentinel) io.observe(sentinel);
    onCleanup(() => io.disconnect());
  });

  return (
    <div class="w-full">
      <div class={mode() === "grid" ? "grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-3"}>
        <For each={items()}>
          {(it) => {
            // MODIFICATION: Use `thumbnail` first, then fall back to `author.avatar`.
            // The `?.` (optional chaining) safely handles cases where `author` might be missing.
            const imageCid = () => it._raw?.thumbnail || it._raw?.author?.avatar;
            
            return (
              <article class="flex flex-col rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]">
                <Show when={imageCid()}>
                  <div class="aspect-video w-full overflow-hidden rounded-t-lg border-b border-[hsl(var(--border))]">
                    <IpfsImage src={imageCid()} />
                  </div>
                </Show>
                <div class="p-3 flex-1 flex flex-col">
                  <h4 class="font-semibold mb-2">Post {it.id}</h4>
                  <p class="text-sm leading-snug">{it.text || "Placeholder text..."}</p>
                  <div class="mt-auto pt-2 text-xs text-[hsl(var(--muted-foreground))]">
                    — Posted just now
                  </div>
                </div>
              </article>
            );
          }}
        </For>
      </div>
      <div ref={(el) => (sentinel = el)} class="h-10" />
      <Show when={loading()}>
        <div class="py-4 text-sm text-[hsl(var(--muted-foreground))]">{t("common.loading")}</div>
      </Show>
    </div>
  );
}