// src/x/feed/ContentFeed.jsx
import { createSignal, onCleanup, onMount, Show, createEffect, on } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import PostListView from "./PostListView.jsx";
import { dbg } from "../../utils/debug.js";
import useUserProfile from "../profile/userProfileStore.js";

export default function ContentFeed(props) {
  const { t, authorizedUser } = useApp();
  const { dataStable: profile } = useUserProfile();

  const [items, setItems] = createSignal([]);
  const [page, setPage] = createSignal(0);
  const [hasMore, setHasMore] = createSignal(true);
  const [loading, setLoading] = createSignal(false);
  const [hasLoadedOnce, setHasLoadedOnce] = createSignal(false);

  const authed = () => !!authorizedUser?.();
  // Important: profile store starts as `null` until resolved; wait for non-null.
  const ready = () => !authed() || profile?.() != null;

  async function loadMore() {
    if (!ready() || loading() || !hasMore()) return;
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

  // Fire initial load only when activated *and* profile is ready for authed users.
  createEffect(() => {
    if (props.isActivated && ready() && !hasLoadedOnce()) {
      dbg.log("ContentFeed", "Component activated and ready. Firing initial loadMore().");
      setHasLoadedOnce(true);
      loadMore();
    }
  });

  onMount(() => {
    const handleScroll = () => {
      if (!props.isActivated || !ready()) return;
      const scrollThreshold = 600;
      const scrolledToBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - scrollThreshold;
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
    window.addEventListener("scroll", throttledHandleScroll, { passive: true });
    onCleanup(() => {
      window.removeEventListener("scroll", throttledHandleScroll);
      if (timeoutId) clearTimeout(timeoutId);
    });
  });

  // Reset pagination on external key changes (domain/category/etc.)
  createEffect(
    on(
      () => props.resetOn,
      () => {
        setItems([]);
        props.onItemsChange?.([]);
        setPage(0);
        setHasMore(true);
        setLoading(false);
        setHasLoadedOnce(false);

        // If already active and ready, load immediately
        if (props.isActivated && ready()) {
          queueMicrotask(() => {
            setHasLoadedOnce(true);
            loadMore();
          });
        }
      },
      { defer: true }
    )
  );

  return (
    <div class="w-full">
      <PostListView items={items()} mode={props.mode} isRailVisible={props.isRailVisible} />
      <Show when={loading()}>
        <div class="py-4 text-sm text-[hsl(var(--muted-foreground))] text-center">{t("common.loading")}</div>
      </Show>
    </div>
  );
}
