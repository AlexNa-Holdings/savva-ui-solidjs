// src/components/feed/ContentFeed.jsx
import { createSignal, onCleanup, onMount, For, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

const DEFAULT_PAGE_SIZE = 12;

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
      const chunk =
        (await props.fetchPage?.(nextPage, props.pageSize || DEFAULT_PAGE_SIZE)) ??
        Array.from({ length: props.pageSize || DEFAULT_PAGE_SIZE }, (_, i) => ({
          id: `mock_${nextPage}_${i}`,
          text: `Test content item #${nextPage}-${i}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque non turpis sed est malesuada tempus.`
        }));
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
      <div
        class={
          mode() === "grid"
            ? "grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            : "flex flex-col gap-3"
        }
      >
        <For each={items()}>
          {(it) => (
            <article class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] p-3">
              <h4 class="font-semibold mb-2">Post {it.id}</h4>
              <p class="text-sm leading-snug">
                {it.text ||
                  "This is placeholder post content. Scroll down to trigger infinite loading and see more items appear."}
              </p>
              <div class="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                — Posted just now
              </div>
            </article>
          )}
        </For>
      </div>

      <div ref={(el) => (sentinel = el)} class="h-10" />

      <Show when={loading()}>
        <div class="py-4 text-sm text-[hsl(var(--muted-foreground))]">{t("common.loading")}</div>
      </Show>
    </div>
  );
}
