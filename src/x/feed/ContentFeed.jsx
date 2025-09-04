// src/x/feed/ContentFeed.jsx
import { createSignal, onCleanup, onMount, For, Show, createEffect, on } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import PostListView from "./PostListView.jsx";
import { dbg } from "../../utils/debug.js";

export default function ContentFeed(props) {
  const { t } = useApp();
  const [items, setItems] = createSignal([]);
  const [page, setPage] = createSignal(0);
  const [hasMore, setHasMore] = createSignal(true);
  const [loading, setLoading] = createSignal(false);
  const [hasLoadedOnce, setHasLoadedOnce] = createSignal(false);

  async function loadMore() {
    if (loading() || !hasMore()) return;
    setLoading(true);
    try {
      const nextPage = page() + 1;
      dbg.log("ContentFeed", "loadMore → page", nextPage);
      const chunk = (await props.fetchPage?.(nextPage, props.pageSize || 12)) ?? [];
      dbg.log("ContentFeed", "page result length", chunk.length);
      if (!chunk.length) setHasMore(false);
      
      setItems((prev) => {
        const next = prev.concat(chunk);
        props.onItemsChange?.(next);
        return next;
      });

      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }

  createEffect(() => {
    // This effect triggers the very first load once the component is activated.
    if (props.isActivated && !hasLoadedOnce()) {
      dbg.log('ContentFeed', 'Component activated. Firing initial loadMore().');
      setHasLoadedOnce(true);
      loadMore();
    }
  });

  onMount(() => {
    const handleScroll = () => {
      // Only load more content if the feed has been activated.
      if (!props.isActivated) return;
      const scrollThreshold = 600;
      const scrolledToBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - scrollThreshold;
      if (scrolledToBottom) loadMore();
    };
    let timeoutId = null;
    const throttledHandleScroll = () => {
      if (timeoutId === null) {
        timeoutId = setTimeout(() => { handleScroll(); timeoutId = null; }, 200);
      }
    };
    window.addEventListener('scroll', throttledHandleScroll, { passive: true });
    onCleanup(() => {
      window.removeEventListener('scroll', throttledHandleScroll);
      if (timeoutId) clearTimeout(timeoutId);
    });
  });

  createEffect(on(() => props.resetOn, () => {
    setItems([]);
    props.onItemsChange?.([]);
    setPage(0);
    setHasMore(true);
    setLoading(false);
    setHasLoadedOnce(false); // Reset the load trigger

    // If the component is already active when a reset occurs, load immediately.
    // Otherwise, the activation effect will handle the load.
    if (props.isActivated) {
      queueMicrotask(() => {
          setHasLoadedOnce(true);
          loadMore();
      });
    }
  }, { defer: true }));

  return (
    <div class="w-full">
      <PostListView
        items={items()}
        mode={props.mode}
        isRailVisible={props.isRailVisible}
      />
      <Show when={loading()}>
        <div class="py-4 text-sm text-[hsl(var(--muted-foreground))] text-center">{t("common.loading")}</div>
      </Show>
    </div>
  );
}