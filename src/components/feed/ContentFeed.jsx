// src/components/feed/ContentFeed.jsx
import { createSignal, onCleanup, onMount, For, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import PostListView from "./PostListView.jsx";

export default function ContentFeed(props) {
  const { t } = useApp();
  const [items, setItems] = createSignal([]);
  const [page, setPage] = createSignal(0);
  const [hasMore, setHasMore] = createSignal(true);
  const [loading, setLoading] = createSignal(false);

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

    const handleScroll = () => {
      const scrollThreshold = 600;
      const scrolledToBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - scrollThreshold;
      if (scrolledToBottom) loadMore();
    };
    
    let timeoutId = null;
    const throttledHandleScroll = () => {
      if (timeoutId === null) {
        timeoutId = setTimeout(() => {
          handleScroll();
          timeoutId = null;
        }, 200);
      }
    };

    window.addEventListener('scroll', throttledHandleScroll, { passive: true });

    onCleanup(() => {
      window.removeEventListener('scroll', throttledHandleScroll);
      if (timeoutId) clearTimeout(timeoutId);
    });
  });

  return (
    <div class="w-full">
      <PostListView items={items()} mode={props.mode} />
      
      <Show when={loading()}>
        <div class="py-4 text-sm text-[hsl(var(--muted-foreground))] text-center">{t("common.loading")}</div>
      </Show>
    </div>
  );
}